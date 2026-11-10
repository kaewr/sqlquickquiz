import type { SupabaseClient } from "@supabase/supabase-js";

export type HistoryItem = {
  id: number;
  submitted_at: string;
  submit_order: number;
  sql_text: string;
  problem: {
    id: number;
    title: string;
    description: string;
    schema_info: string;
    expected_example: string;
    max_score: number;
    released: boolean;
  };
  /** มีค่าเฉพาะเมื่อประกาศผลแล้วและให้คะแนนแล้ว (RLS ไม่ส่งผลก่อนประกาศ) */
  result: { score: number; verdict: "correct" | "partial" | "incorrect"; feedback: string | null } | null;
};

type ResultRow = { score: number | string; verdict: "correct" | "partial" | "incorrect"; feedback: string | null };
type Row = {
  id: number;
  submitted_at: string;
  submit_order: number;
  sql_text: string;
  problems: {
    id: number;
    title: string;
    description: string;
    schema_info: string;
    expected_example: string;
    max_score: number | string;
    results_released_at: string | null;
  } | null;
  results: ResultRow | ResultRow[] | null;
};

/** ประวัติการส่งของนิสิตเอง (RLS: เห็นเฉพาะของตัวเอง, ผลเฉพาะข้อที่ประกาศแล้ว) เรียงล่าสุดก่อน */
export async function fetchHistory(supabase: SupabaseClient): Promise<HistoryItem[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id, submitted_at, submit_order, sql_text, problems(id, title, description, schema_info, expected_example, max_score, results_released_at), results(score, verdict, feedback)",
    )
    .order("submitted_at", { ascending: false })
    .overrideTypes<Row[], { merge: false }>();
  if (error) throw error;
  return (data ?? [])
    .filter((r) => r.problems)
    .map(({ problems, results, ...s }) => {
      const p = problems!;
      const r = Array.isArray(results) ? results[0] : results;
      return {
        ...s,
        problem: {
          id: p.id,
          title: p.title,
          description: p.description,
          schema_info: p.schema_info,
          expected_example: p.expected_example,
          max_score: Number(p.max_score),
          released: !!p.results_released_at,
        },
        result: p.results_released_at && r ? { score: Number(r.score), verdict: r.verdict, feedback: r.feedback } : null,
      };
    });
}
