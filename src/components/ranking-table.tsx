"use client";

import { useState } from "react";
import { formatScore } from "@/lib/grading";

export type RankingRow = {
  submit_order: number;
  score_rank: number;
  student_id_masked: string;
  score: number | null;
  submitted_at: string;
};

type SortKey = "score" | "order";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "เรียงตามคะแนน" },
  { key: "order", label: "เรียงตามลำดับส่ง" },
];

const timeFmt = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** ตารางหน้าอันดับ: สลับเรียงตามคะแนน (ค่าเริ่มต้น) / ตามลำดับส่ง — ไม่ต้องโหลดใหม่ */
export function RankingTable({ rows }: { rows: RankingRow[] }) {
  const [sort, setSort] = useState<SortKey>("score");
  const sorted = [...rows].sort((a, b) => (sort === "score" ? a.score_rank - b.score_rank : a.submit_order - b.submit_order));

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="การเรียง" className="inline-flex w-fit overflow-hidden rounded-lg border border-border">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={sort === s.key}
            onClick={() => setSort(s.key)}
            className={`px-3 py-1.5 text-sm ${sort === s.key ? "bg-primary text-primary-fg" : "hover:bg-muted"}`}
            data-testid={`sort-${s.key}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" data-testid="ranking" data-sort={sort}>
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2 text-right">อันดับ</th>
              <th className="px-3 py-2 text-right">ลำดับส่ง</th>
              <th className="px-3 py-2">รหัสนิสิต</th>
              <th className="px-3 py-2">เวลาส่ง</th>
              <th className="px-3 py-2 text-right">คะแนน</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.submit_order} className="border-t border-border" data-testid="ranking-row">
                <td className="px-3 py-2 text-right font-semibold tabular-nums" data-testid="row-rank">
                  {r.score_rank}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground/70" data-testid="row-order">
                  {r.submit_order}
                </td>
                <td className="px-3 py-2 font-mono">{r.student_id_masked}</td>
                <td className="px-3 py-2 tabular-nums">{timeFmt.format(new Date(r.submitted_at))}</td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid="row-score">
                  {r.score === null ? <span className="text-foreground/50">รอตรวจ</span> : formatScore(r.score)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
