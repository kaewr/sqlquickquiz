"use client";

import { useRef, useState, useTransition } from "react";
import { Markdown } from "@/components/markdown";
import { submitAnswer } from "@/app/actions/submit";
import { MAX_SQL_LENGTH, type CurrentProblem } from "@/lib/current-problems";

const timeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatSubmittedAt(iso: string) {
  return timeFormat.format(new Date(iso)) + " น.";
}

type Props = {
  problem: CurrentProblem;
  onSubmitted: (submission: NonNullable<CurrentProblem["submission"]>) => void;
  onClosed: () => void;
  onAlreadySubmitted: () => void;
};

export function ProblemCard({ problem, onSubmitted, onClosed, onAlreadySubmitted }: Props) {
  const titleId = `problem-${problem.id}-title`;
  // ข้อความแจ้งเตือนอยู่ระดับการ์ด: ยังแสดงอยู่แม้ฟอร์มถูกแทนด้วยใบยืนยัน (กรณีส่งซ้ำจากอีกอุปกรณ์)
  const [error, setError] = useState("");
  return (
    <article className="card flex flex-col gap-4" aria-labelledby={titleId} data-testid={`problem-${problem.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {problem.title}
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            problem.is_open ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-muted text-foreground/70"
          }`}
          data-testid="problem-status"
        >
          {problem.is_open ? "เปิดรับคำตอบ" : "ปิดรับคำตอบแล้ว"}
        </span>
      </header>

      <p className="-mt-2 text-sm text-foreground/60">
        คะแนนเต็ม {problem.max_score} · ส่งแล้ว <span data-testid="submission-count">{problem.submission_count}</span> คน
      </p>

      {problem.description && <Markdown>{problem.description}</Markdown>}
      {problem.schema_info && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">โครงสร้างตาราง</h3>
          <Markdown>{problem.schema_info}</Markdown>
        </section>
      )}
      {problem.expected_example && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">ตัวอย่างผลลัพธ์</h3>
          <Markdown>{problem.expected_example}</Markdown>
        </section>
      )}

      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}
      {!error && !problem.is_open && !problem.submission && (
        <p role="alert" className="alert alert-error">
          ปิดรับคำตอบแล้ว
        </p>
      )}

      {problem.submission ? (
        <div role="status" className="alert alert-success" data-testid="receipt">
          <p className="font-semibold">ส่งแล้ว</p>
          <p>
            เวลา {formatSubmittedAt(problem.submission.submitted_at)} · ลำดับที่{" "}
            <span data-testid="receipt-order">{problem.submission.submit_order}</span>
          </p>
        </div>
      ) : (
        <SubmitForm
          problem={problem}
          onError={setError}
          onSubmitted={onSubmitted}
          onClosed={onClosed}
          onAlreadySubmitted={onAlreadySubmitted}
        />
      )}
    </article>
  );
}

function SubmitForm({
  problem,
  onError,
  onSubmitted,
  onClosed,
  onAlreadySubmitted,
}: Props & { onError: (message: string) => void }) {
  const [sql, setSql] = useState("");
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputId = `sql-${problem.id}`;
  const tooLong = sql.length > MAX_SQL_LENGTH;
  const empty = sql.trim() === "";
  const closed = !problem.is_open;

  function confirmSubmit() {
    dialogRef.current?.close();
    startTransition(async () => {
      const result = await submitAnswer(problem.id, sql);
      if (result.ok) {
        onError("");
        onSubmitted({ submitted_at: result.submitted_at, submit_order: result.submit_order });
        return;
      }
      onError(result.error);
      if (result.code === "PROBLEM_CLOSED") onClosed();
      if (result.code === "ALREADY_SUBMITTED") onAlreadySubmitted();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-semibold">
        คำสั่ง SQL ของคุณ
      </label>
      <textarea
        id={inputId}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        disabled={closed || pending}
        rows={6}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="วางคำสั่ง SQL ที่ทดลองแล้วที่นี่"
        className="input font-mono text-sm leading-relaxed"
        aria-describedby={`${inputId}-count`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={`${inputId}-count`} className={`text-xs ${tooLong ? "text-danger" : "text-foreground/60"}`} data-testid="sql-length">
          {sql.length.toLocaleString("th-TH")} / {MAX_SQL_LENGTH.toLocaleString("th-TH")} ตัวอักษร
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={closed || pending || empty || tooLong}
          onClick={() => {
            onError("");
            dialogRef.current?.showModal();
          }}
        >
          {pending ? "กำลังส่ง…" : "ส่งคำตอบ"}
        </button>
      </div>


      <dialog
        ref={dialogRef}
        aria-labelledby={`${inputId}-confirm`}
        className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border border-border bg-background p-0 text-foreground backdrop:bg-black/40"
      >
        <div className="flex flex-col gap-3 p-5">
          <h3 id={`${inputId}-confirm`} className="text-lg font-semibold">
            ยืนยันการส่งคำตอบ
          </h3>
          <p>
            ข้อ “{problem.title}” <strong>ส่งได้ครั้งเดียว แก้ไม่ได้</strong> ตรวจคำสั่ง SQL ให้แน่ใจก่อนส่ง
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmSubmit}>
              ยืนยันส่ง
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
