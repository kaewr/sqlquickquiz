"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminSubmission } from "@/lib/admin-submissions";
import { thaiError } from "@/lib/errors";
import {
  GRADE_LEVELS,
  VERDICT_CLASS,
  VERDICT_LABEL,
  formatScore,
  saveGrade,
  scoreFor,
  validScore,
  verdictFor,
  type GradeValue,
} from "@/lib/grading";

const timeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * คำตอบ 1 รายการ = 2 แถว
 * แถวบน: ลำดับ · รหัส (ชี้ = ชื่อ/ตอน) · เวลา · คะแนน · ความเห็น
 * แถวล่าง: SQL เต็มความกว้าง
 * ปุ่มลัดแสดงผลทันที (optimistic) แล้วบันทึก ถ้าไม่สำเร็จจะเปลี่ยนกลับ
 */
export function SubmissionRows({
  submission,
  maxScore,
  supabase,
  onGraded,
}: {
  submission: AdminSubmission;
  maxScore: number;
  supabase: SupabaseClient;
  onGraded: (result: GradeValue) => void;
}) {
  const s = submission;
  const [shown, setShown] = useState<GradeValue | null>(s.result);
  const [scoreText, setScoreText] = useState(s.result ? formatScore(s.result.score) : "");
  const [feedback, setFeedback] = useState(s.result?.feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // กดหลายปุ่มติดกัน: ใช้เฉพาะผลของคำขอล่าสุด (คำขอก่อนหน้าที่ตอบช้าไม่ทับ)
  const seq = useRef(0);
  const confirmed = useRef<GradeValue | null>(s.result);
  const levels = GRADE_LEVELS.map((l) => ({ ...l, score: scoreFor(maxScore, l.pct) }));

  async function save(score: number, withFeedback: boolean) {
    const mine = ++seq.current;
    setShown({ score, verdict: verdictFor(score, maxScore), feedback: withFeedback ? feedback : (shown?.feedback ?? null) });
    setScoreText(formatScore(score));
    setError("");
    setSaving(true);
    const res = await saveGrade(supabase, s.id, score, withFeedback ? feedback : undefined);
    if (res.ok) confirmed.current = res.value;
    if (mine !== seq.current) return; // มีคำขอใหม่กว่าแล้ว
    setSaving(false);
    if (!res.ok) {
      // กลับไปค่าล่าสุดที่บันทึกสำเร็จ
      const back = confirmed.current;
      setShown(back);
      setScoreText(back ? formatScore(back.score) : "");
      setError(thaiError(res.code));
      return;
    }
    setShown(res.value);
    onGraded(res.value);
  }

  const who = `${s.first_name} ${s.last_name} · ตอน ${s.section}`;

  return (
    <>
      <tr className="border-t border-border align-top" data-testid={`sub-row-${s.student_id}`}>
        <td className="px-3 py-2 text-right tabular-nums">{s.submit_order}</td>
        <td className="px-3 py-2">
          <span title={who} className="cursor-help font-mono underline decoration-dotted" data-testid="student-id">
            {s.student_id}
          </span>
          <span className="sr-only"> {who}</span>
        </td>
        <td className="px-3 py-2 tabular-nums">{timeFormat.format(new Date(s.submitted_at))}</td>
        <td className="px-3 py-2" data-testid={`grade-${s.student_id}`}>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              {shown ? (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[shown.verdict]}`} data-testid="grade-verdict">
                  {VERDICT_LABEL[shown.verdict]} {formatScore(shown.score)}/{formatScore(maxScore)}
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground/60" data-testid="grade-verdict">
                  ยังไม่ให้คะแนน
                </span>
              )}
              {saving && <span className="text-xs text-foreground/50">กำลังบันทึก…</span>}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label={`ปุ่มลัดคะแนน ${s.student_id}`}>
              {levels.map((l) => (
                <button
                  key={l.pct}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  title={`${l.pct}% = ${formatScore(l.score)} คะแนน`}
                  onClick={() => void save(l.score, false)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const value = Number(scoreText);
                if (scoreText.trim() === "" || !validScore(value)) {
                  setError("คะแนนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป (ทศนิยมไม่เกิน 2 ตำแหน่ง)");
                  return;
                }
                if (value > maxScore) {
                  setError(thaiError("SCORE_OUT_OF_RANGE"));
                  return;
                }
                void save(value, true);
              }}
            >
              <input
                value={scoreText}
                onChange={(e) => setScoreText(e.target.value)}
                inputMode="decimal"
                aria-label={`คะแนน ${s.student_id}`}
                placeholder={`0–${formatScore(maxScore)}`}
                className="input w-20 px-2 py-1 text-sm"
              />
              <button type="submit" className="btn btn-primary btn-sm">
                บันทึก
              </button>
            </form>
            {error && (
              <span role="alert" className="text-xs text-danger">
                {error}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={2000}
            rows={3}
            aria-label={`ความเห็น ${s.student_id}`}
            placeholder="ความเห็น (บันทึกพร้อมปุ่มบันทึกคะแนน)"
            className="input min-w-[14rem] px-2 py-1 text-xs"
          />
        </td>
      </tr>
      <tr className="align-top" data-testid={`sql-row-${s.student_id}`}>
        <td />
        <td colSpan={4} className="px-3 pb-3">
          <pre className="max-h-72 overflow-auto rounded bg-muted p-2 font-mono text-xs leading-relaxed">{s.sql_text}</pre>
        </td>
      </tr>
    </>
  );
}
