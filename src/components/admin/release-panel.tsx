"use client";

import { useState, useTransition } from "react";
import { releaseResults } from "@/app/actions/grading";

const dateTime = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

/** ประกาศผลปุ่มเดียว: แจ้งเตือนถ้ายังให้คะแนนไม่ครบ → ได้ลิงก์อันดับพร้อมปุ่มคัดลอก */
export function ReleasePanel({
  problemId,
  graded,
  total,
  initial,
}: {
  problemId: number;
  graded: number;
  total: number;
  initial: { url: string; releasedAt: string } | null;
}) {
  const [released, setReleased] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const ungraded = total - graded;

  function release() {
    setConfirming(false);
    start(async () => {
      const res = await releaseResults(problemId);
      if (!res.ok) setError(res.error);
      else {
        setError("");
        setReleased({ url: res.url, releasedAt: res.releasedAt });
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
            disabled={pending || total === 0}
            onClick={() => (ungraded > 0 ? setConfirming(true) : release())}
          >
            {pending ? "กำลังประกาศ…" : "ประกาศผล"}
          </button>
        )}
      </div>

      {confirming && (
        <div role="alertdialog" aria-labelledby="release-warning" className="alert border border-warning-border bg-warning-bg text-warning-fg">
          <p id="release-warning">
            ยังไม่ได้ให้คะแนน <strong>{ungraded}</strong> คน — คนที่ยังไม่ได้ให้คะแนนจะเห็น “รอตรวจ” จนกว่าจะให้คะแนน
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
