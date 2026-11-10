import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProblemInput } from "@/lib/problem-form";

export type AdminProblem = {
  id: number;
  title: string;
  description: string;
  schema_info: string;
  expected_example: string;
  max_score: number;
  order_matters: boolean;
  dataset_name: string | null;
  created_at: string;
  results_released_at: string | null;
  reference_sql: string;
  is_open: boolean;
  submission_count: number;
  opened_at: string | null;
  closed_at: string | null;
};

type Row = Omit<AdminProblem, "reference_sql" | "is_open" | "submission_count" | "opened_at" | "closed_at"> & {
  problem_solutions: { reference_sql: string } | null;
  problem_status: { is_open: boolean; submission_count: number; opened_at: string | null; closed_at: string | null } | null;
};

/** โจทย์ 1 ข้อพร้อมเฉลยและสถานะ — อ่านด้วย session ของอาจารย์ (RLS) */
export async function getAdminProblem(id: number): Promise<AdminProblem | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("problems")
    .select(
      "id, title, description, schema_info, expected_example, max_score, order_matters, dataset_name, created_at, results_released_at, problem_solutions(reference_sql), problem_status(is_open, submission_count, opened_at, closed_at)",
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<Row, { merge: false }>();
  if (!data) return null;
  const { problem_solutions, problem_status, ...p } = data;
  return {
    ...p,
    max_score: Number(p.max_score),
    reference_sql: problem_solutions?.reference_sql ?? "",
    is_open: problem_status?.is_open ?? false,
    submission_count: problem_status?.submission_count ?? 0,
    opened_at: problem_status?.opened_at ?? null,
    closed_at: problem_status?.closed_at ?? null,
  };
}

export function toFormInput(p: AdminProblem): ProblemInput {
  return {
    title: p.title,
    description: p.description,
    schema_info: p.schema_info,
    expected_example: p.expected_example,
    max_score: String(p.max_score),
    order_matters: p.order_matters,
    dataset_name: p.dataset_name ?? "",
    reference_sql: p.reference_sql,
  };
}

export function parseId(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : NaN;
}
