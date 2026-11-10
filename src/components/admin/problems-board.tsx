"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBroadcast } from "@/lib/use-broadcast";
import { OpenToggle } from "@/components/admin/open-toggle";

export type BoardProblem = {
  id: number;
  title: string;
  is_open: boolean;
  submission_count: number;
  opened_at: string | null;
};

const timeFormat = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

/** รายการโจทย์ของวัน + ร่าง — ตัวนับและสถานะเปิด/ปิดอัปเดต realtime */
export function ProblemsBoard({ day, drafts }: { day: BoardProblem[]; drafts: BoardProblem[] }) {
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
        // เปิดครั้งแรก = ย้ายจากร่างไปอยู่วันนี้ → ดึงหน้าใหม่
        onMessage: () => router.refresh(),
      },
    ],
    () => router.refresh(),
  );

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="day-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="day-heading" className="font-semibold">
            โจทย์ที่เปิดในวันที่เลือก ({day.length} ข้อ)
          </h2>
          <span className="text-xs text-foreground/60" data-testid="realtime-status" data-state={connection}>
            {connection === "connected" ? "อัปเดตอัตโนมัติ" : "กำลังเชื่อมต่อ…"}
          </span>
        </div>
        {day.length === 0 ? (
          <p className="card text-center text-foreground/60">ไม่มีโจทย์ที่เปิดครั้งแรกในวันที่เลือก</p>
        ) : (
          <ProblemTable rows={day.map(merge)} showOpened onChanged={() => router.refresh()} />
        )}
      </section>

      <section aria-labelledby="draft-heading" className="flex flex-col gap-2">
        <h2 id="draft-heading" className="font-semibold">
          ยังไม่เคยเปิด ({drafts.length} ข้อ)
        </h2>
        {drafts.length === 0 ? (
          <p className="card text-center text-foreground/60">ไม่มีโจทย์ที่เตรียมไว้</p>
        ) : (
          <ProblemTable rows={drafts.map(merge)} onChanged={() => router.refresh()} />
        )}
      </section>
    </div>
  );
}

function ProblemTable({ rows, showOpened, onChanged }: { rows: BoardProblem[]; showOpened?: boolean; onChanged: () => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th className="px-3 py-2">โจทย์</th>
            {showOpened && <th className="px-3 py-2">เปิดเมื่อ</th>}
            <th className="px-3 py-2">สถานะ</th>
            <th className="px-3 py-2 text-right">ผู้ส่ง</th>
            <th className="px-3 py-2 text-right">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border" data-testid={`board-row-${p.id}`}>
              <td className="px-3 py-2">
                <Link href={`/admin/problems/${p.id}`} className="font-medium text-primary hover:underline">
                  {p.title}
                </Link>
              </td>
              {showOpened && (
                <td className="px-3 py-2 text-foreground/70">{p.opened_at ? `${timeFormat.format(new Date(p.opened_at))} น.` : "-"}</td>
              )}
              <td className="px-3 py-2" data-testid="board-status">
                {p.is_open ? <span className="text-green-700 dark:text-green-400">เปิดรับ</span> : "ปิด"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="board-count">
                {p.submission_count}
              </td>
              <td className="px-3 py-2 text-right">
                <OpenToggle problemId={p.id} isOpen={p.is_open} onChanged={onChanged} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
