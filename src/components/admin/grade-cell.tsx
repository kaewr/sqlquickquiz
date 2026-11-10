"use client";

import { useState, useTransition } from "react";
import { gradeSubmission } from "@/app/actions/grading";
import type { AdminSubmission } from "@/lib/admin-submissions";

export const VERDICT_LABEL = { correct: "ถูก", partial: "ได้บางส่วน", incorrect: "ผิด" } as const;
export const VERDICT_CLASS = {
  correct: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  incorrect: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
} as const;

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

/** ให้คะแนนรายคน: ปุ่มลัด (บันทึกทันที) + กรอกเอง/ความเห็น (กดบันทึก) */
export function GradeCell({
  submission,
  maxScore,
  onGraded,
}: {
  submission: AdminSubmission;
  maxScore: number;
  onGraded: (result: NonNullable<AdminSubmission["result"]>) => void;
}) {
  const r = submission.result;
  const [score, setScore] = useState(r ? fmt(r.score) : "");
  const [feedback, setFeedback] = useState(r?.feedback ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const half = Math.round((maxScore / 2) * 100) / 100;

  function save(value: number, withFeedback: boolean) {
    start(async () => {
      const res = await gradeSubmission(submission.id, value, withFeedback ? feedback : undefined);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError("");
      setScore(fmt(res.score));
      setFeedback(res.feedback ?? "");
      onGraded({ score: res.score, verdict: res.verdict, feedback: res.feedback });
    });
  }

  return (
    <div className="flex min-w-[15rem] flex-col gap-1.5" data-testid={`grade-${submission.student_id}`}>
      <div className="flex items-center gap-2">
        {r ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[r.verdict]}`} data-testid="grade-verdict">
            {VERDICT_LABEL[r.verdict]} {fmt(r.score)}/{fmt(maxScore)}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/60" data-testid="grade-verdict">
            ยังไม่ให้คะแนน
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={`ปุ่มลัดคะแนน ${submission.student_id}`}>
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => save(maxScore, false)}>
          เต็ม
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => save(half, false)}>
          ครึ่ง
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => save(0, false)}>
          ศูนย์
        </button>
      </div>
      <form
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const value = Number(score);
          if (score.trim() === "" || !Number.isFinite(value)) {
            setError("กรุณาใส่คะแนนเป็นตัวเลข");
            return;
          }
          save(value, true);
        }}
      >
        <div className="flex gap-1">
          <input
            value={score}
            onChange={(e) => setScore(e.target.value)}
            inputMode="decimal"
            aria-label={`คะแนน ${submission.student_id}`}
            placeholder={`0–${fmt(maxScore)}`}
            className="input w-20 px-2 py-1 text-sm"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? "…" : "บันทึก"}
          </button>
        </div>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          maxLength={2000}
          rows={2}
          aria-label={`ความเห็น ${submission.student_id}`}
          placeholder="ความเห็น (ไม่บังคับ)"
          className="input px-2 py-1 text-xs"
        />
      </form>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
