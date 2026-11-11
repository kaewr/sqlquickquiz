"use server";

import { createClient } from "@/lib/supabase/server";
import { thaiError } from "@/lib/errors";
import { rankingUrl } from "@/lib/site-url";

/** ประกาศผล: ตั้งเวลาประกาศ + สร้างลิงก์อันดับในครั้งเดียว (เรียกซ้ำได้ลิงก์เดิม)
 *  ฐานข้อมูลบังคับ: ปิดรับคำตอบแล้ว + ทุกคำตอบมีคะแนน + มีผู้ส่ง */
export async function releaseResults(
  problemId: number,
): Promise<{ ok: true; url: string; releasedAt: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_results", { p_problem_id: problemId });
  if (error) {
    const code = ["NOT_INSTRUCTOR", "PROBLEM_NOT_FOUND", "PROBLEM_STILL_OPEN", "UNGRADED_SUBMISSIONS", "NO_SUBMISSIONS"].includes(error.message) ? error.message : "DB_ERROR";
    if (code === "DB_ERROR") console.error("[releaseResults]", error);
    return { ok: false, error: thaiError(code) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, url: await rankingUrl(row.public_token), releasedAt: row.results_released_at };
}
