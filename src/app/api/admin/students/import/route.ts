import { NextResponse, type NextRequest } from "next/server";
import { requireInstructor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateRows, type StudentRow } from "@/lib/csv";
import { studentEmail } from "@/lib/student-id";
import { adminRouteError, isKeyRejected } from "@/lib/admin-route";

const MAX_ROWS = 2000;
const CONCURRENCY = 5;

type Failed = { student_id: string; message: string };

/**
 * นำเข้ารายชื่อนิสิต
 * - รหัสใหม่: สร้างบัญชี Auth (รหัสผ่าน = รหัสนิสิต, ยืนยันอีเมลแล้ว) + profile
 * - รหัสที่มีอยู่แล้ว: อัปเดตชื่อ/นามสกุล/ตอนเรียน ไม่สร้างซ้ำ
 */
export async function POST(request: NextRequest) {
  const auth = await requireInstructor();
  if (!auth.ok) return auth.error;
  try {
    return await importStudents(request);
  } catch (error) {
    return adminRouteError("import", error);
  }
}

async function importStudents(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const input = Array.isArray(body?.rows) ? (body.rows as StudentRow[]) : null;
  if (!input || input.length === 0 || input.length > MAX_ROWS) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // ตรวจซ้ำฝั่งเซิร์ฟเวอร์ (ไม่เชื่อผลตรวจจากหน้าเว็บ)
  const { valid, errors } = validateRows(
    input.map((r, i) => ({
      line: Number(r?.line) || i + 2,
      student_id: String(r?.student_id ?? ""),
      first_name: String(r?.first_name ?? ""),
      last_name: String(r?.last_name ?? ""),
      section: String(r?.section ?? ""),
    })),
  );
  const failed: Failed[] = errors.map((e) => ({ student_id: e.student_id || `บรรทัด ${e.line}`, message: e.message }));

  const admin = createAdminClient();

  // รหัสที่มีอยู่แล้ว
  const existing = new Map<string, string>();
  for (let i = 0; i < valid.length; i += 500) {
    const ids = valid.slice(i, i + 500).map((r) => r.student_id);
    const { data, error } = await admin.from("profiles").select("user_id, student_id").in("student_id", ids);
    if (error) {
      console.error("[admin:import] lookup profiles", error);
      return NextResponse.json({ error: isKeyRejected(error) ? "SERVICE_KEY_REJECTED" : "DB_ERROR" }, { status: 500 });
    }
    for (const p of data ?? []) existing.set(p.student_id, p.user_id);
  }

  // บัญชี Auth ที่มีอยู่แต่ไม่มี profile (เช่นนำเข้าครั้งก่อนล้มกลางทาง) — โหลดเมื่อจำเป็น
  let authByEmail: Map<string, string> | null = null;
  async function findAuthUserId(email: string): Promise<string | undefined> {
    if (!authByEmail) {
      authByEmail = new Map();
      for (let page = 1; ; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) break;
        for (const u of data.users) if (u.email) authByEmail.set(u.email.toLowerCase(), u.id);
        if (data.users.length < 1000) break;
      }
    }
    return authByEmail.get(email);
  }

  let created = 0;
  let updated = 0;

  async function importRow(row: StudentRow) {
    const profileFields = { first_name: row.first_name, last_name: row.last_name, section: row.section };
    const existingId = existing.get(row.student_id);
    if (existingId) {
      const { error } = await admin.from("profiles").update(profileFields).eq("user_id", existingId);
      if (error) failed.push({ student_id: row.student_id, message: "อัปเดตไม่สำเร็จ" });
      else updated++;
      return;
    }

    const email = studentEmail(row.student_id);
    let userId: string | undefined;
    let createdAuthUser = false;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: row.student_id,
      email_confirm: true,
    });
    if (data?.user) {
      userId = data.user.id;
      createdAuthUser = true;
    } else if (error?.code === "email_exists") {
      userId = await findAuthUserId(email);
      if (userId) await admin.auth.admin.updateUserById(userId, { password: row.student_id, ban_duration: "none" });
    }
    if (!userId) {
      if (error) console.error("[admin:import] createUser", row.student_id, error.code, error.message);
      failed.push({ student_id: row.student_id, message: "สร้างบัญชีไม่สำเร็จ" });
      return;
    }

    const { error: profileError } = await admin.from("profiles").insert({ user_id: userId, student_id: row.student_id, ...profileFields });
    if (profileError) {
      console.error("[admin:import] insert profile", row.student_id, profileError);
      if (createdAuthUser) await admin.auth.admin.deleteUser(userId);
      failed.push({ student_id: row.student_id, message: "บันทึกข้อมูลนิสิตไม่สำเร็จ" });
      return;
    }
    created++;
  }

  // ทำทีละไม่กี่แถวพร้อมกัน ไม่ให้ชนเพดานของ Auth
  for (let i = 0; i < valid.length; i += CONCURRENCY) {
    await Promise.all(valid.slice(i, i + CONCURRENCY).map(importRow));
  }

  return NextResponse.json({ created, updated, failed });
}
