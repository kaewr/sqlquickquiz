"use client";

import { useState, useTransition } from "react";
import { releaseResults } from "@/app/actions/grading";

const dateTime = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

/**
 * ประกาศผลปุ่มเดียว → ได้ลิงก์อันดับพร้อมปุ่มคัดลอก
 * กดได้เมื่อ ปิดรับคำตอบแล้ว + มีผู้ส่ง + ให้คะแนนครบ (ฐานข้อมูลบังคับซ้ำใน release_results)
 */
export function ReleasePanel({
  problemId,
  graded,
  total,
  isOpen,
  initial,
  onReleased,
}: {
  problemId: number;
  graded: number;
  total: number;
  isOpen: boolean;
  initial: { url: string; releasedAt: string } | null;
  onReleased?: () => void;
}) {
  const [released, setReleased] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const ungraded = total - graded;
  const blockers = [
    isOpen && "ต้องปิดรับคำตอบก่อน",
    total === 0 && "ยังไม่มีผู้ส่งคำตอบ",
    ungraded > 0 && `ยังไม่ได้ให้คะแนน ${ungraded} คน`,
  ].filter((b): b is string => Boolean(b));

  function release() {
    setConfirming(false);
    start(async () => {
      const res = await releaseResults(problemId);
      if (!res.ok) setError(res.error);
      else {
        setError("");
        setReleased({ url: res.url, releasedAt: res.releasedAt });
        onReleased?.();
      }
    });
  }

  async function copy() {
    if (!released) return;
    try {
      await navigator.clipboard.writeText(released.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("คัดลอกอัตโนมัติไม่ได้ ให้เลือกข้อความลิงก์แล้วคัดลอกเอง");
    }
  }

  return (
    <section className="card flex flex-col gap-3" aria-labelledby="release-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="release-heading" className="font-semibold">
            ให้คะแนนและประกาศผล
          </h2>
          <p className="text-sm" data-testid="grading-progress">
            ให้คะแนนแล้ว <strong>{graded}</strong> / {total}
          </p>
        </div>
        {!released && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || blockers.length > 0}
            onClick={() => setConfirming(true)}
          >
            {pending ? "กำลังประกาศ…" : "ประกาศผล"}
          </button>
        )}
      </div>

      {!released && blockers.length > 0 && (
        <p className="text-sm text-foreground/70" data-testid="release-blockers">
          ประกาศผลได้เมื่อ: {blockers.join(" · ")}
        </p>
      )}

      {confirming && blockers.length === 0 && (
        <div role="alertdialog" aria-labelledby="release-warning" className="alert border border-warning-border bg-warning-bg text-warning-fg">
          <p id="release-warning">
            ประกาศผลแล้ว<strong>ยกเลิกไม่ได้</strong> และ<strong>เปิดรับคำตอบข้อนี้อีกไม่ได้</strong> (แก้คะแนนต่อได้)
            ประกาศผลเลยหรือไม่?
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={release}>
              ประกาศเลย
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {released && (
        <div className="flex flex-col gap-2" data-testid="released">
          <p className="text-sm text-green-700 dark:text-green-400">
            ประกาศผลแล้วเมื่อ {dateTime.format(new Date(released.releasedAt))} น. — นิสิตเห็นผลในแท็บ “ประวัติของฉัน”
            แก้คะแนนต่อได้ นิสิตจะเห็นค่าล่าสุด
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={released.url}
              aria-label="ลิงก์หน้าอันดับ"
              onFocus={(e) => e.target.select()}
              className="input min-w-0 flex-1 font-mono text-sm"
              data-testid="ranking-url"
            />
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
            </button>
          </div>
          <a href={released.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
            เปิดหน้าอันดับ ↗
          </a>
        </div>
      )}

      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}
    </section>
  );
}
