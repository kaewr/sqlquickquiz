import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { fetchPublicResults } from "@/lib/public-results";
import { formatScore } from "@/lib/grading";

export const metadata: Metadata = {
  title: "อันดับ — SQL Quick Quiz",
  robots: { index: false, follow: false },
};

/** หน้าอันดับสาธารณะ (ไม่ต้องล็อกอิน) — token ผิด proxy.ts ตอบ 404 ไปแล้วก่อนถึงหน้านี้ */
export default function RankingPage({ params }: PageProps<"/r/[token]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <Suspense fallback={<p className="text-foreground/60">กำลังโหลด…</p>}>
        <Ranking params={params} />
      </Suspense>
    </main>
  );
}

const dateFmt = new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
const timeFmt = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit" });

async function Ranking({ params }: { params: PageProps<"/r/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const rows = await fetchPublicResults(token);
  if (rows.length === 0) notFound();
  const head = rows[0];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm text-foreground/60">SQL Quick Quiz · ผลการทำโจทย์</p>
        <h1 className="text-2xl font-bold">{head.problem_title}</h1>
        <p className="mt-1 text-sm text-foreground/70">
          {head.problem_date && <>วันที่ {dateFmt.format(new Date(`${head.problem_date}T00:00:00Z`))} · </>}
          คะแนนเต็ม {formatScore(head.max_score)} · ผู้ส่ง {rows.length} คน
        </p>
        <p className="text-xs text-foreground/50">ประกาศผลเมื่อ {dateTimeFmt.format(new Date(head.released_at))} น.</p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" data-testid="ranking">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2 text-right">อันดับ</th>
              <th className="px-3 py-2">รหัสนิสิต</th>
              <th className="px-3 py-2">เวลาส่ง</th>
              <th className="px-3 py-2 text-right">คะแนน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.submit_order} className="border-t border-border" data-testid="ranking-row">
                <td className="px-3 py-2 text-right tabular-nums">{r.submit_order}</td>
                <td className="px-3 py-2 font-mono">{r.student_id_masked}</td>
                <td className="px-3 py-2 tabular-nums">{timeFmt.format(new Date(r.submitted_at))}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.score === null ? <span className="text-foreground/50">รอตรวจ</span> : formatScore(r.score)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground/50">อันดับเรียงตามเวลาส่ง · รหัสนิสิตแสดงบางส่วนเพื่อความเป็นส่วนตัว</p>
    </div>
  );
}
