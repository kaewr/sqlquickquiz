import { NextResponse } from "next/server";
import { strToU8, zipSync } from "fflate";
import { requireInstructor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { bangkokStamp, toCsv } from "@/lib/csv-export";
import { adminRouteError } from "@/lib/admin-route";

/** ตาราง → คอลัมน์ (ระบุชัดเพื่อให้มีหัวตารางแม้ไม่มีข้อมูล) และคอลัมน์ที่ใช้เรียง/แบ่งช่วง */
const TABLES: Record<string, { columns: string[]; orderBy: string }> = {
  instructors: { columns: ["email", "created_at"], orderBy: "email" },
  profiles: {
    columns: ["user_id", "student_id", "first_name", "last_name", "section", "password_changed", "is_active", "created_at"],
    orderBy: "user_id",
  },
  problems: {
    columns: [
      "id",
      "title",
      "description",
      "schema_info",
      "expected_example",
      "max_score",
      "order_matters",
      "dataset_name",
      "created_at",
      "results_released_at",
      "public_token",
    ],
    orderBy: "id",
  },
  problem_solutions: { columns: ["problem_id", "reference_sql"], orderBy: "problem_id" },
  problem_status: { columns: ["problem_id", "is_open", "submission_count", "opened_at", "closed_at"], orderBy: "problem_id" },
  submissions: {
    columns: ["id", "problem_id", "student_user_id", "sql_text", "submitted_at", "submit_order"],
    orderBy: "id",
  },
  results: {
    columns: ["id", "submission_id", "score", "verdict", "feedback", "source", "graded_by", "graded_at"],
    orderBy: "id",
  },
  grading_jobs: { columns: ["id", "problem_id", "status", "total", "done", "error", "created_at"], orderBy: "id" },
};

const PAGE = 1000;

/** สำรองข้อมูลทุกตารางเป็น zip ของ CSV — อ่านด้วย session อาจารย์ (RLS อนุญาตครบ) ไม่ใช้ service key */
export async function GET() {
  const auth = await requireInstructor();
  if (!auth.ok) return auth.error;
  try {
    const supabase = await createClient();
    const files: Record<string, Uint8Array> = {};
    const counts: string[] = [];

    for (const [table, { columns, orderBy }] of Object.entries(TABLES)) {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from(table)
          .select(columns.join(","))
          .order(orderBy)
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
        if (!data || data.length < PAGE) break;
      }
      const csv = toCsv([columns, ...rows.map((r) => columns.map((c) => (r[c] === null ? null : String(r[c]))))]);
      files[`${table}.csv`] = strToU8(csv);
      counts.push(`${table}.csv\t${rows.length} แถว`);
    }

    const stamp = bangkokStamp();
    files["README.txt"] = strToU8(
      [
        "SQL Quick Quiz — สำรองข้อมูล",
        `เวลา (Asia/Bangkok): ${stamp}`,
        "รูปแบบ: CSV UTF-8 (มี BOM) เปิดใน Excel ได้",
        "ไม่รวมข้อมูลบัญชีและรหัสผ่านใน auth",
        "",
        ...counts,
        "",
      ].join("\r\n"),
    );

    const zip = zipSync(files, { level: 6 });
    return new NextResponse(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="sql-quick-quiz-backup-${stamp}.zip"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return adminRouteError("backup", error);
  }
}
