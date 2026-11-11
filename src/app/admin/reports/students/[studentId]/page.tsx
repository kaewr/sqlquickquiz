import { Suspense } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/admin/admin-gate";
import { createClient } from "@/lib/supabase/server";
import { parseReportFilter } from "@/lib/report";
import { problemNumbers } from "@/lib/problem-numbers";
import { VERDICT_CLASS, VERDICT_LABEL, formatScore, type Verdict } from "@/lib/grading";

export default function StudentReportPage({ params, searchParams }: PageProps<"/admin/reports/students/[studentId]">) {
  return (
    <Suspense fallback={<p className="p-6 text-foreground/60">กำลังโหลด…</p>}>
      <AdminGate>
        <StudentReport params={params} searchParams={searchParams} />
      </AdminGate>
    </Suspense>
  );
}

type ScoreRow = { problem_id: number; title: string; day: string; max_score: number | string; submitted: boolean; score: number | string | null };
type ResultRow = { score: number | string; verdict: Verdict; feedback: string | null };
type SubRow = {
  problem_id: number;
  sql_text: string;
  submitted_at: string;
  submit_order: number;
  results: ResultRow | ResultRow[] | null;
};

const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "medium" });

/** รายละเอียดรายคน: ทุกข้อในช่วงวันที่ (เหมือนหน้ารายงาน) พร้อม SQL ที่ส่ง คะแนน ผล ความเห็น — อ่านผ่าน RLS ของอาจารย์ */
async function StudentReport({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/reports/students/[studentId]">["params"];
  searchParams: PageProps<"/admin/reports/students/[studentId]">["searchParams"];
}) {
  const supabase = await createClient();
  const { studentId } = await params;
  const filter = parseReportFilter(await searchParams);

  const backQs = new URLSearchParams();
  if (filter.from) backQs.set("from", filter.from);
  if (filter.to) backQs.set("to", filter.to);
  const backHref = `/admin/reports${backQs.size ? `?${backQs}` : ""}`;
  const back = (
    <Link href={backHref} className="text-sm text-foreground/60 hover:underline">
      ‹ รายงานรายคน
    </Link>
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, student_id, first_name, last_name, section, is_active")
    .eq("student_id", studentId)
    .maybeSingle();
  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p className="card text-center text-foreground/60" data-testid="student-not-found">
          ไม่พบนิสิตรหัส {studentId}
        </p>
      </div>
    );
  }

  let scoreQuery = supabase
    .from("v_student_problem_scores")
    .select("problem_id, title, day, max_score, submitted, score")
    .eq("student_id", profile.student_id)
    .range(0, 4999);
  if (filter.from) scoreQuery = scoreQuery.gte("day", filter.from);
  if (filter.to) scoreQuery = scoreQuery.lte("day", filter.to);

  const [{ data: scoreRows, error: scoreError }, { data: subRows, error: subError }, numbers] = await Promise.all([
    scoreQuery.overrideTypes<ScoreRow[], { merge: false }>(),
    supabase
      .from("submissions")
      .select("problem_id, sql_text, submitted_at, submit_order, results(score, verdict, feedback)")
      .eq("student_user_id", profile.user_id)
      .range(0, 4999)
      .overrideTypes<SubRow[], { merge: false }>(),
    problemNumbers(supabase),
  ]);
  if (scoreError) throw scoreError;
  if (subError) throw subError;

  const subs = new Map((subRows ?? []).map((s) => [s.problem_id, s]));
  const items = (scoreRows ?? [])
    .map((r) => {
      const sub = subs.get(r.problem_id);
      const res = sub ? (Array.isArray(sub.results) ? sub.results[0] : sub.results) : null;
      return {
        id: r.problem_id,
        number: numbers.get(r.problem_id) ?? null,
        title: r.title,
        day: r.day,
        max: Number(r.max_score),
        sub,
        result: res ? { score: Number(res.score), verdict: res.verdict, feedback: res.feedback } : null,
      };
    })
    .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.id - b.id);

  const submitted = items.filter((i) => i.sub).length;
  const pending = items.filter((i) => i.sub && !i.result).length;
  const total = Math.round(items.reduce((t, i) => t + (i.result?.score ?? 0), 0) * 100) / 100;
  const maxTotal = Math.round(items.reduce((t, i) => t + i.max, 0) * 100) / 100;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        {back}
        <h1 className="text-xl font-semibold" data-testid="student-heading">
          <span className="font-mono">{profile.student_id}</span> · {profile.first_name} {profile.last_name}
          {!profile.is_active && <span className="ml-2 rounded-full bg-muted px-2 text-xs text-danger">ปิดบัญชี</span>}
        </h1>
        <p className="text-sm text-foreground/60">
          ตอน {profile.section}
          {(filter.from || filter.to) &&
            ` · วันที่เปิด ${filter.from ? dateFormat.format(new Date(`${filter.from}T00:00:00Z`)) : "แรกสุด"} – ${
              filter.to ? dateFormat.format(new Date(`${filter.to}T00:00:00Z`)) : "ล่าสุด"
            }`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="student-summary">
        <Stat label="ส่งแล้ว" value={`${submitted} / ${items.length} ข้อ`} />
        <Stat label="คะแนนรวม" value={`${formatScore(total)} / ${formatScore(maxTotal)}`} accent testId="student-total" />
        <Stat label="รอตรวจ" value={`${pending} ข้อ`} />
        <Stat label="ไม่ได้ส่ง" value={`${items.length - submitted} ข้อ`} />
      </dl>

      {items.length === 0 ? (
        <p className="card text-center text-foreground/60">ไม่มีโจทย์ที่เปิดในช่วงวันที่นี้</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.id} className="card flex flex-col gap-3" data-testid={`student-item-${i.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-accent">{i.number === null ? "ข้อ –" : `ข้อ ${i.number}`}</p>
                  <Link href={`/admin/problems/${i.id}`} className="font-medium text-primary hover:underline">
                    {i.title}
                  </Link>
                  <p className="text-xs text-foreground/60">เปิด {dateFormat.format(new Date(`${i.day}T00:00:00Z`))}</p>
                </div>
                <div className="text-right" data-testid="item-score">
                  {!i.sub ? (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground/70">ไม่ได้ส่ง</span>
                  ) : i.result ? (
                    <>
                      <p className="text-lg font-semibold tabular-nums">
                        {formatScore(i.result.score)} <span className="text-sm font-normal text-foreground/60">/ {formatScore(i.max)}</span>
                      </p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${VERDICT_CLASS[i.result.verdict]}`}>
                        {VERDICT_LABEL[i.result.verdict]}
                      </span>
                    </>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground/70">รอตรวจ · เต็ม {formatScore(i.max)}</span>
                  )}
                </div>
              </div>
              {i.sub && (
                <>
                  <p className="text-xs text-foreground/60">
                    ส่งเมื่อ {timeFormat.format(new Date(i.sub.submitted_at))} น. · ลำดับที่ {i.sub.submit_order}
                  </p>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-sm" data-testid="item-sql">
                    {i.sub.sql_text}
                  </pre>
                  {i.result?.feedback && (
                    <p className="text-sm" data-testid="item-feedback">
                      <span className="text-foreground/60">ความเห็น: </span>
                      {i.result.feedback}
                    </p>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Stat({ label, value, accent, testId }: { label: string; value: string; accent?: boolean; testId?: string }) {
  return (
    <div className={`rounded-xl border border-border p-3 ${accent ? "bg-accent-bg" : ""}`}>
      <dt className="text-xs text-foreground/60">{label}</dt>
      <dd className={`font-semibold tabular-nums ${accent ? "text-accent" : ""}`} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
