"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchHistory, type HistoryItem } from "@/lib/history";
import { Markdown } from "@/components/markdown";

const dateTime = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

const STATUS = {
  pending: { label: "รอตรวจ", className: "bg-muted text-foreground/70" },
  correct: { label: "ถูก", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  partial: { label: "ได้บางส่วน", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  incorrect: { label: "ผิด", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
} as const;

/** แท็บ "ประวัติของฉัน" — ดึงใหม่ทุกครั้งที่เปิดแท็บ หรือกลับมาที่หน้าเว็บ */
export function StudentHistory({ active }: { active: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await fetchHistory(supabase));
      setError("");
    } catch (e) {
      console.error("load history failed", e);
      setError("โหลดประวัติไม่สำเร็จ กรุณาลองใหม่");
    }
  }, [supabase]);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ดึงข้อมูลจากภายนอกเมื่อเปิดแท็บ
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active, load]);

  if (error) {
    return (
      <p role="alert" className="alert alert-error">
        {error}
      </p>
    );
  }
  if (!items) return <p className="card text-center text-foreground/60">กำลังโหลด…</p>;
  if (items.length === 0) return <p className="card text-center text-foreground/60">ยังไม่มีประวัติการส่งคำตอบ</p>;

  return (
    <ol className="flex flex-col gap-3" data-testid="history-list">
      {items.map((item) => {
        const status = item.result ? STATUS[item.result.verdict] : STATUS.pending;
        return (
          <li key={item.id} className="card flex flex-col gap-3" data-testid={`history-${item.problem.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold">{item.problem.title}</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`} data-testid="history-status">
                {status.label}
                {item.result && ` ${fmt(item.result.score)}/${fmt(item.problem.max_score)}`}
              </span>
            </div>
            <p className="-mt-1 text-sm text-foreground/60">
              ส่งเมื่อ {dateTime.format(new Date(item.submitted_at))} น. · ลำดับที่ {item.submit_order}
            </p>

            {item.result?.feedback && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm" data-testid="history-feedback">
                <p className="mb-1 font-medium">ความเห็นจากอาจารย์</p>
                <p className="whitespace-pre-wrap break-words">{item.result.feedback}</p>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium">คำสั่ง SQL ที่ส่ง</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs" data-testid="history-sql">
                {item.sql_text}
              </pre>
            </div>

            <details>
              <summary className="cursor-pointer text-sm text-primary">ดูโจทย์</summary>
              <div className="mt-2 flex flex-col gap-3">
                {item.problem.description && <Markdown>{item.problem.description}</Markdown>}
                {item.problem.schema_info && <Markdown>{item.problem.schema_info}</Markdown>}
                {item.problem.expected_example && <Markdown>{item.problem.expected_example}</Markdown>}
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
