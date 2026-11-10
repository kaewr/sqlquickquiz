"use server";

import { createClient } from "@/lib/supabase/server";
import { thaiError } from "@/lib/errors";
import { rankingUrl } from "@/lib/site-url";

export type GradeResult =
  | { ok: true; score: number; verdict: "correct" | "partial" | "incorrect"; feedback: string | null }
  | { ok: false; error: string };

const MAX_FEEDBACK = 2000;

/**
 * ให้คะแนนด้วยมือ (source = manual) — verdict ฐานข้อมูลคำนวณเอง
 * feedback = undefined → ไม่แตะความเห็นเดิม (ปุ่มลัด)
 */
export async function gradeSubmission(submissionId: number, score: number, feedback?: string): Promise<GradeResult> {
  const twoDecimals = Math.abs(score * 100 - Math.round(score * 100)) < 1e-6;
  if (!Number.isInteger(submissionId) || !Number.isFinite(score) || score < 0 || !twoDecimals) {
    return { ok: false, error: "คะแนนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป (ทศนิยมไม่เกิน 2 ตำแหน่ง)" };
  }
  if (feedback !== undefined && feedback.length > MAX_FEEDBACK) {
    return { ok: false, error: "ความเห็นยาวได้ไม่เกิน 2,000 ตัวอักษร" };
  }

  const supabase = await createClient();
  const { data: isInstructor } = await supabase.rpc("is_instructor");
  if (!isInstructor) return { ok: false, error: thaiError("NOT_INSTRUCTOR") };

  const row: Record<string, unknown> = { submission_id: submissionId, score, source: "manual" };
  if (feedback !== undefined) row.feedback = feedback.trim() === "" ? null : feedback;

  const { data, error } = await supabase
    .from("results")
    .upsert(row, { onConflict: "submission_id" })
    .select("score, verdict, feedback")
    .single();
  if (error || !data) {
    if (error?.message === "SCORE_OUT_OF_RANGE") return { ok: false, error: thaiError("SCORE_OUT_OF_RANGE") };
    console.error("[gradeSubmission]", error);
    return { ok: false, error: thaiError("DB_ERROR") };
  }
  return { ok: true, score: Number(data.score), verdict: data.verdict, feedback: data.feedback };
}

/** ประกาศผล: ตั้งเวลาประกาศ + สร้างลิงก์อันดับในครั้งเดียว (เรียกซ้ำได้ลิงก์เดิม) */
export async function releaseResults(
  problemId: number,
): Promise<{ ok: true; url: string; releasedAt: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_results", { p_problem_id: problemId });
  if (error) {
    const code = ["NOT_INSTRUCTOR", "PROBLEM_NOT_FOUND"].includes(error.message) ? error.message : "DB_ERROR";
    if (code === "DB_ERROR") console.error("[releaseResults]", error);
    return { ok: false, error: thaiError(code) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, url: await rankingUrl(row.public_token), releasedAt: row.results_released_at };
}
