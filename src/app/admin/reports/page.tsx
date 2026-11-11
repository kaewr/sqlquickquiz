import { Suspense } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/admin/admin-gate";
import { createClient } from "@/lib/supabase/server";
import { buildReport, cellText, parseReportFilter } from "@/lib/report";
import { formatScore } from "@/lib/grading";

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <Suspense fallback={<p className="p-6 text-foreground/60">กำลังโหลด…</p>}>
      <AdminGate>
        <Reports searchParams={searchParams} />
      </AdminGate>
    </Suspense>
  );
}

const shortDate = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });

async function Reports({ searchParams }: { searchParams: PageProps<"/admin/reports">["searchParams"] }) {
  const supabase = await createClient();
  const filter = parseReportFilter(await searchParams);
  const [report, { data: sectionRows }] = await Promise.all([
    buildReport(supabase, filter),
    supabase.from("profiles").select("section").range(0, 4999),
  ]);
  const sections = [...new Set((sectionRows ?? []).map((r) => r.section as string))].sort((a, b) => a.localeCompare(b, "th"));
  // มีตอนเดียว → ซ่อนคอลัมน์และตัวกรองตอน (กลับมาแสดงเองเมื่อมีหลายตอน หรือกรองตอนค้างไว้)
  const showSection = sections.length > 1 || Boolean(filter.section);
  const studentQs = new URLSearchParams();
  if (filter.from) studentQs.set("from", filter.from);
  if (filter.to) studentQs.set("to", filter.to);
  const studentHref = (id: string) => `/admin/reports/students/${id}${studentQs.size ? `?${studentQs}` : ""}`;

  const qs = new URLSearchParams();
  if (filter.from) qs.set("from", filter.from);
  if (filter.to) qs.set("to", filter.to);
  if (filter.section) qs.set("section", filter.section);
  const csvHref = `/api/admin/reports/csv${qs.size ? `?${qs}` : ""}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">รายงานรายคน</h1>
          <p className="text-sm text-foreground/60">
            {report.students.length} คน × {report.problems.length} ข้อ · คะแนนเต็มรวม {formatScore(report.maxTotal)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={csvHref} download className="btn btn-primary" data-testid="export-csv">
            ส่งออก CSV
          </a>
          <a href="/api/admin/backup" download className="btn btn-secondary" data-testid="backup">
            สำรองข้อมูลทั้งหมด (zip)
          </a>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/admin/reports">
        <label className="field">
          <span>ตั้งแต่วันที่</span>
          <input type="date" name="from" defaultValue={filter.from ?? ""} className="input" />
        </label>
        <label className="field">
          <span>ถึงวันที่</span>
          <input type="date" name="to" defaultValue={filter.to ?? ""} className="input" />
        </label>
        {showSection && (
          <label className="field">
            <span>ตอนเรียน</span>
            <select name="section" defaultValue={filter.section ?? ""} className="input">
              <option value="">ทุกตอนเรียน</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  ตอน {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="btn btn-secondary">
          แสดง
        </button>
        {qs.size > 0 && (
          <Link href="/admin/reports" className="btn btn-secondary">
            ล้างตัวกรอง
          </Link>
        )}
      </form>
      <p className="-mt-2 text-xs text-foreground/60">
        วันที่ = วันที่เปิดโจทย์ครั้งแรก (เวลากรุงเทพ) · ชี้ที่ “ข้อ N” เพื่อดูชื่อโจทย์ · กดรหัสนิสิตเพื่อดู SQL และคะแนนรายข้อ · ช่องว่าง = ไม่ได้ส่ง · “รอตรวจ” = ส่งแล้วยังไม่ให้คะแนน (ไม่นับในคะแนนรวม)
      </p>

      {report.problems.length === 0 ? (
        <p className="card text-center text-foreground/60">ไม่มีโจทย์ที่เปิดในช่วงวันที่นี้</p>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-border">
          <table className="text-sm" data-testid="report-table">
            <thead className="sticky top-0 z-20 bg-muted text-left">
              <tr>
                <th className="sticky left-0 z-30 bg-muted px-3 py-2">รหัสนิสิต</th>
                <th className="px-3 py-2">ชื่อ - นามสกุล</th>
                {showSection && <th className="px-3 py-2">ตอน</th>}
                {report.problems.map((p) => {
                  const label = p.number === null ? "ข้อ –" : `ข้อ ${p.number}`;
                  const tip = `${label}: ${p.title}
เปิด ${shortDate.format(new Date(`${p.day}T00:00:00Z`))} · เต็ม ${formatScore(p.max_score)}`;
                  return (
                    <th
                      key={p.id}
                      className="whitespace-nowrap px-3 py-2 text-right align-bottom"
                      data-testid={`report-col-${p.id}`}
                      title={tip}
                    >
                      <Link href={`/admin/problems/${p.id}`} className="font-medium text-primary hover:underline" aria-label={tip}>
                        {label}
                      </Link>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-right">ส่ง (ข้อ)</th>
                <th className="px-3 py-2 text-right">คะแนนรวม</th>
                <th className="px-3 py-2 text-right">เต็มรวม</th>
              </tr>
            </thead>
            <tbody>
              {report.students.map((s) => (
                <tr key={s.student_id} className="border-t border-border" data-testid={`report-row-${s.student_id}`}>
                  <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-mono">
                    <Link href={studentHref(s.student_id)} className="text-primary hover:underline" data-testid={`student-link-${s.student_id}`}>
                      {s.student_id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {s.first_name} {s.last_name}
                    {!s.is_active && <span className="ml-2 rounded-full bg-muted px-2 text-xs text-danger">ปิดบัญชี</span>}
                  </td>
                  {showSection && <td className="px-3 py-1.5">{s.section}</td>}
                  {report.problems.map((p) => {
                    const text = cellText(s.cells[p.id]);
                    return (
                      <td
                        key={p.id}
                        className={`px-3 py-1.5 text-right tabular-nums ${text === "รอตรวจ" ? "text-xs text-foreground/50" : ""}`}
                        data-testid={`cell-${s.student_id}-${p.id}`}
                      >
                        {text}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right tabular-nums" data-testid={`submitted-${s.student_id}`}>
                    {s.submitted}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums" data-testid={`total-${s.student_id}`}>
                    {formatScore(s.total)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-foreground/60">{formatScore(report.maxTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
