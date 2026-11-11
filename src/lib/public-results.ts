import { createClient } from "@supabase/supabase-js";

/** แถวของหน้าอันดับ — get_public_results คืนเฉพาะรหัสแบบปิดบางส่วนและคะแนน (ไม่มี SQL / ชื่อ) */
export type PublicResultRow = {
  problem_title: string;
  max_score: number;
  problem_date: string | null;
  released_at: string;
  submit_order: number;
  /** อันดับตามคะแนน (มาก → น้อย, เท่ากันใครส่งก่อนได้ดีกว่า) */
  score_rank: number;
  student_id_masked: string;
  score: number | null;
  submitted_at: string;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** เรียกแบบไม่ล็อกอิน (publishable key, ไม่ใช้ cookie) */
export async function fetchPublicResults(token: string): Promise<PublicResultRow[]> {
  if (!TOKEN_PATTERN.test(token)) return [];
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_public_results", { p_token: token });
  if (error) {
    console.error("[get_public_results]", error);
    return [];
  }
  return ((data ?? []) as PublicResultRow[]).map((r) => ({
    ...r,
    max_score: Number(r.max_score),
    score: r.score === null ? null : Number(r.score),
  }));
}
