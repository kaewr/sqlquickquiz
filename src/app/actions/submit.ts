"use server";

import { createClient } from "@/lib/supabase/server";
import { thaiError } from "@/lib/errors";
import { MAX_SQL_LENGTH } from "@/lib/current-problems";

export type SubmitResult =
  | { ok: true; submitted_at: string; submit_order: number }
  | { ok: false; code: string; error: string };

const KNOWN = new Set(["NOT_STUDENT", "INVALID_SQL_TEXT", "PROBLEM_CLOSED", "ALREADY_SUBMITTED"]);

/** ส่งคำตอบผ่าน submit_answer ด้วย session ของนิสิต (กฎทั้งหมดบังคับที่ฐานข้อมูล) */
export async function submitAnswer(problemId: number, sqlText: string): Promise<SubmitResult> {
  if (!Number.isInteger(problemId) || typeof sqlText !== "string") {
    return { ok: false, code: "INVALID_INPUT", error: thaiError("INVALID_INPUT") };
  }
  if (sqlText.trim() === "" || sqlText.length > MAX_SQL_LENGTH) {
    return { ok: false, code: "INVALID_SQL_TEXT", error: thaiError("INVALID_SQL_TEXT") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_answer", { p_problem_id: problemId, p_sql_text: sqlText });
  if (error) {
    const code = KNOWN.has(error.message) ? error.message : error.code === "42501" ? "NOT_STUDENT" : "SERVER_ERROR";
    if (code === "SERVER_ERROR") console.error("[submit_answer]", error);
    return { ok: false, code, error: thaiError(code) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, submitted_at: row.submitted_at, submit_order: row.submit_order };
}
