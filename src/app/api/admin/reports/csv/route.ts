import { NextResponse, type NextRequest } from "next/server";
import { requireInstructor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildReport, parseReportFilter, reportRows } from "@/lib/report";
import { bangkokStamp, toCsv } from "@/lib/csv-export";
import { adminRouteError } from "@/lib/admin-route";

/** ส่งออกรายงานรายคนเป็น CSV (UTF-8 BOM) ตามตัวกรองเดียวกับหน้ารายงาน — ใช้ session อาจารย์ */
export async function GET(request: NextRequest) {
  const auth = await requireInstructor();
  if (!auth.ok) return auth.error;
  try {
    const filter = parseReportFilter(Object.fromEntries(request.nextUrl.searchParams));
    const report = await buildReport(await createClient(), filter);
    const name = `report-${bangkokStamp()}${filter.section ? `-sec${filter.section.replace(/[^0-9A-Za-z_-]/g, "")}` : ""}.csv`;
    return new NextResponse(toCsv(reportRows(report)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return adminRouteError("report-csv", error);
  }
}
