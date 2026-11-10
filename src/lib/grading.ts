import type { SupabaseClient } from "@supabase/supabase-js";

export type Verdict = "correct" | "partial" | "incorrect";
export type GradeValue = { score: number; verdict: Verdict; feedback: string | null };

/** ปุ่มลัด 5 ระดับ (% ของคะแนนเต็ม) */
export const GRADE_LEVELS = [
  { label: "เต็ม", pct: 100 },
  { label: "ดี", pct: 80 },
  { label: "ครึ่ง", pct: 50 },
  { label: "ปรับปรุง", pct: 25 },
  { label: "ศูนย์", pct: 0 },
] as const;

export const VERDICT_LABEL: Record<Verdict, string> = { correct: "ถูก", partial: "ได้บางส่วน", incorrect: "ผิด" };
export const VERDICT_CLASS: Record<Verdict, string> = {
  correct: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  incorrect: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

/** คะแนนจาก % ปัดทศนิยม 2 ตำแหน่ง */
export function scoreFor(maxScore: number, pct: number): number {
  return Math.round(maxScore * pct) / 100;
}

/** กฎเดียวกับฐานข้อมูล (ใช้แสดงผลทันทีก่อนบันทึกเสร็จ — ค่าจริงมาจากฐานข้อมูล) */
export function verdictFor(score: number, maxScore: number): Verdict {
  if (score === maxScore) return "correct";
  if (score === 0) return "incorrect";
  return "partial";
}

export function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function validScore(score: number): boolean {
  return Number.isFinite(score) && score >= 0 && Math.abs(score * 100 - Math.round(score * 100)) < 1e-6;
}

/**
 * บันทึกคะแนนตรงจากเบราว์เซอร์ด้วย session ของอาจารย์ (1 ครั้งไปยัง Supabase)
 * RLS อนุญาตเฉพาะอาจารย์; ฐานข้อมูลตรวจคะแนนเกินและคำนวณ verdict เอง
 * feedback = undefined → ไม่แตะความเห็นเดิม
 */
export async function saveGrade(
  supabase: SupabaseClient,
  submissionId: number,
  score: number,
  feedback?: string,
): Promise<{ ok: true; value: GradeValue } | { ok: false; code: string }> {
  const row: Record<string, unknown> = { submission_id: submissionId, score, source: "manual" };
  if (feedback !== undefined) row.feedback = feedback.trim() === "" ? null : feedback;
  const { data, error } = await supabase
    .from("results")
    .upsert(row, { onConflict: "submission_id" })
    .select("score, verdict, feedback")
    .single();
  if (error || !data) {
    if (error?.message === "SCORE_OUT_OF_RANGE") return { ok: false, code: "SCORE_OUT_OF_RANGE" };
    if (error?.code === "42501") return { ok: false, code: "NOT_INSTRUCTOR" };
    console.error("[saveGrade]", error);
    return { ok: false, code: "DB_ERROR" };
  }
  return { ok: true, value: { score: Number(data.score), verdict: data.verdict, feedback: data.feedback } };
}
