"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { thaiError } from "@/lib/errors";
import { readProblemForm, validateProblem, type ProblemFormState } from "@/lib/problem-form";

/** ทุก action ตรวจว่าเป็นอาจารย์ก่อน (RLS กันซ้ำอีกชั้น) — ใช้ session ของอาจารย์ ไม่ใช้ service key */
async function instructorClient() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_instructor");
  return data ? supabase : null;
}

function columns(input: ReturnType<typeof readProblemForm>) {
  return {
    title: input.title,
    description: input.description,
    schema_info: input.schema_info,
    expected_example: input.expected_example,
    max_score: Number(input.max_score),
    order_matters: input.order_matters,
    dataset_name: input.dataset_name || null,
  };
}

export async function createProblem(_prev: ProblemFormState, formData: FormData): Promise<ProblemFormState> {
  const input = readProblemForm(formData);
  const errors = validateProblem(input);
  if (errors) return { values: input, errors };

  const supabase = await instructorClient();
  if (!supabase) return { values: input, error: thaiError("NOT_INSTRUCTOR") };

  const { data, error } = await supabase.from("problems").insert(columns(input)).select("id").single();
  if (error || !data) {
    console.error("[createProblem]", error);
    return { values: input, error: thaiError("DB_ERROR") };
  }
  const { error: solError } = await supabase
    .from("problem_solutions")
    .insert({ problem_id: data.id, reference_sql: input.reference_sql });
  if (solError) {
    console.error("[createProblem] solution", solError);
    return { values: input, error: thaiError("DB_ERROR") };
  }
  redirect(`/admin/problems/${data.id}`);
}

export async function updateProblem(
  problemId: number,
  _prev: ProblemFormState,
  formData: FormData,
): Promise<ProblemFormState> {
  const input = readProblemForm(formData);
  const errors = validateProblem(input);
  if (errors) return { values: input, errors };

  const supabase = await instructorClient();
  if (!supabase) return { values: input, error: thaiError("NOT_INSTRUCTOR") };

  const { error } = await supabase.from("problems").update(columns(input)).eq("id", problemId);
  if (error) {
    if (error.message === "MAX_SCORE_BELOW_GIVEN") {
      return { values: input, errors: { max_score: thaiError("MAX_SCORE_BELOW_GIVEN") } };
    }
    console.error("[updateProblem]", error);
    return { values: input, error: thaiError("DB_ERROR") };
  }
  const { error: solError } = await supabase
    .from("problem_solutions")
    .upsert({ problem_id: problemId, reference_sql: input.reference_sql });
  if (solError) {
    console.error("[updateProblem] solution", solError);
    return { values: input, error: thaiError("DB_ERROR") };
  }
  redirect(`/admin/problems/${problemId}`);
}

/** เปิด/ปิดรับคำตอบ (trigger ตั้ง opened_at/closed_at และส่ง broadcast ให้นิสิต) */
export async function setProblemOpen(problemId: number, open: boolean): Promise<{ error?: string }> {
  const supabase = await instructorClient();
  if (!supabase) return { error: thaiError("NOT_INSTRUCTOR") };
  const { data, error } = await supabase
    .from("problem_status")
    .update({ is_open: open })
    .eq("problem_id", problemId)
    .select("problem_id");
  if (error || !data?.length) {
    console.error("[setProblemOpen]", error);
    return { error: thaiError(error ? "DB_ERROR" : "PROBLEM_NOT_FOUND") };
  }
  return {};
}
