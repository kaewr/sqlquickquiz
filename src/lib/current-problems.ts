import type { SupabaseClient } from "@supabase/supabase-js";

/** โจทย์ที่นิสิตเห็นในแท็บ "โจทย์ปัจจุบัน" (ไม่มีเฉลย — RLS ไม่ให้อ่าน problem_solutions อยู่แล้ว) */
export type CurrentProblem = {
  id: number;
  title: string;
  description: string;
  schema_info: string;
  expected_example: string;
  max_score: number;
  is_open: boolean;
  submission_count: number;
  submission: { submitted_at: string; submit_order: number } | null;
};

type ProblemRow = Omit<CurrentProblem, "is_open" | "submission_count" | "submission"> & {
  problem_status: { is_open: boolean; submission_count: number } | null;
};

const PROBLEM_COLUMNS =
  "id, title, description, schema_info, expected_example, max_score, problem_status!inner(is_open, submission_count)";

/** ดึงโจทย์ที่เปิดอยู่ (หรือเฉพาะ id ที่ระบุ) พร้อมคำตอบของนิสิตเอง — ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ */
export async function fetchCurrentProblems(
  supabase: SupabaseClient,
  opts: { ids?: number[] } = {},
): Promise<CurrentProblem[]> {
  let query = supabase.from("problems").select(PROBLEM_COLUMNS).order("id");
  query = opts.ids ? query.in("id", opts.ids) : query.eq("problem_status.is_open", true);
  const { data, error } = await query.overrideTypes<ProblemRow[], { merge: false }>();
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // RLS: นิสิตเห็นเฉพาะคำตอบของตัวเอง
  const { data: subs, error: subError } = await supabase
    .from("submissions")
    .select("problem_id, submitted_at, submit_order")
    .in("problem_id", rows.map((r) => r.id));
  if (subError) throw subError;
  const byProblem = new Map((subs ?? []).map((s) => [s.problem_id as number, s]));

  return rows.map(({ problem_status, ...p }) => {
    const sub = byProblem.get(p.id);
    return {
      ...p,
      max_score: Number(p.max_score),
      is_open: problem_status?.is_open ?? false,
      submission_count: problem_status?.submission_count ?? 0,
      submission: sub ? { submitted_at: sub.submitted_at, submit_order: sub.submit_order } : null,
    };
  });
}

export const MAX_SQL_LENGTH = 10_000;
