"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBroadcast } from "@/lib/use-broadcast";
import { OpenToggle } from "@/components/admin/open-toggle";

export type BoardProblem = {
  id: number;
  /** หมายเลขข้อ (ลำดับเวลาเปิดครั้งแรก) — null = ยังไม่เคยเปิด */
  number: number | null;
  title: string;
  is_open: boolean;
  submission_count: number;
  opened_at: string | null;
  released?: boolean;
};

const openedFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** โจทย์ที่เปิดแล้ว (ตามตัวกรองวันที่) + โจทย์ที่ยังไม่เคยเปิด — ตัวนับและสถานะเปิด/ปิดอัปเดต realtime */
export function ProblemsBoard({ opened, drafts, filtered }: { opened: BoardProblem[]; drafts: BoardProblem[]; filtered: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [live, setLive] = useState<Record<number, Partial<BoardProblem>>>({});
  // ตัวนับเพิ่มอย่างเดียว: ใช้ค่าที่มากกว่าระหว่างค่าจากเซิร์ฟเวอร์กับ broadcast
  const merge = (p: BoardProblem) => ({
    ...p,
    submission_count: Math.max(p.submission_count, live[p.id]?.submission_count ?? 0),
  });

  const connection = useBroadcast(
    supabase,
    [
      {
        topic: "problem-counts",
        event: "count",
        onMessage: (m) =>
          setLive((l) => ({ ...l, [Number(m.problem_id)]: { ...l[Number(m.problem_id)], submission_count: Number(m.submission_count) } })),
      },
      {
        topic: "problem-state",
        event: "state",
        // เปิดครั้งแรก = ย้ายจากกลุ่มยังไม่เปิดไปอยู่รายการที่เปิดแล้ว (ได้หมายเลขข้อ) → ดึงหน้าใหม่
        onMessage: () => router.refresh(),
      },
    ],
    () => router.refresh(),
  );

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="draft-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="draft-heading" className="font-semibold">
            ยังไม่เคยเปิด ({drafts.length} ข้อ)
          </h2>
          <span className="text-xs text-foreground/60" data-testid="realtime-status" data-state={connection}>
            {connection === "connected" ? "อัปเดตอัตโนมัติ" : "กำลังเชื่อมต่อ…"}
          </span>
        </div>
        {drafts.length === 0 ? (
          <p className="card text-center text-foreground/60">ไม่มีโจทย์ที่เตรียมไว้</p>
        ) : (
          <ProblemTable rows={drafts.map(merge)} onChanged={() => router.refresh()} testId="drafts-table" />
        )}
      </section>

      <section aria-labelledby="opened-heading" className="flex flex-col gap-2">
        <h2 id="opened-heading" className="font-semibold">
          เปิดแล้ว ({opened.length} ข้อ)
        </h2>
        {opened.length === 0 ? (
          <p className="card text-center text-foreground/60">
            {filtered ? "ไม่มีโจทย์ที่เปิดครั้งแรกในช่วงวันที่นี้" : "ยังไม่มีโจทย์ที่เปิด"}
          </p>
        ) : (
          <ProblemTable rows={opened.map(merge)} showOpened onChanged={() => router.refresh()} testId="opened-table" />
        )}
      </section>
    </div>
  );
}

function ProblemTable({
  rows,
  showOpened,
  onChanged,
  testId,
}: {
  rows: BoardProblem[];
  showOpened?: boolean;
  onChanged: () => void;
  testId: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[40rem] text-sm" data-testid={testId}>
        <thead className="bg-muted text-left">
          <tr>
            {showOpened && <th className="w-16 px-3 py-2">ข้อ</th>}
            {showOpened && <th className="px-3 py-2">เปิดครั้งแรก</th>}
            <th className="px-3 py-2">โจทย์</th>
            <th className="px-3 py-2">สถานะ</th>
            <th className="px-3 py-2 text-right">ผู้ส่ง</th>
            <th className="px-3 py-2 text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border" data-testid={`board-row-${p.id}`}>
              {showOpened && (
                <td className="px-3 py-2 font-semibold text-accent tabular-nums" data-testid="board-number">
                  {p.number ?? "-"}
                </td>
              )}
              {showOpened && (
                <td className="whitespace-nowrap px-3 py-2 text-foreground/70" data-testid="board-opened">
                  {p.opened_at ? `${openedFormat.format(new Date(p.opened_at))} น.` : "-"}
                </td>
              )}
              <td className="px-3 py-2">
                <Link href={`/admin/problems/${p.id}`} className="font-medium text-primary hover:underline">
                  {p.title}
                </Link>
              </td>
              <td className="px-3 py-2" data-testid="board-status">
                {p.is_open ? <span className="text-green-700 dark:text-green-400">เปิดรับ</span> : "ปิด"}
                {p.released && (
                  <span className="ml-2 rounded-full bg-accent-bg px-2 py-0.5 text-xs text-accent" data-testid="board-released">
                    ประกาศผลแล้ว
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="board-count">
                {p.submission_count}
              </td>
              <td className="px-3 py-2 text-right">
                <OpenToggle problemId={p.id} isOpen={p.is_open} released={p.released} onChanged={onChanged} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
