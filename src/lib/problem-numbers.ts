import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * หมายเลขข้อ = ลำดับตามเวลาเปิดครั้งแรกของโจทย์ทั้งหมด (1, 2, 3, …)
 * ไม่ขึ้นกับตัวกรองของหน้า · โจทย์ที่ยังไม่เคยเปิดไม่มีเลข · เลขเลื่อนเฉพาะเมื่อลบโจทย์ที่เปิดก่อนหน้า
 * อ่านด้วย session ของอาจารย์ (RLS)
 */
export async function problemNumbers(supabase: SupabaseClient): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from("problem_status")
    .select("problem_id, opened_at")
    .not("opened_at", "is", null)
    .order("opened_at")
    .order("problem_id")
    .range(0, 9999);
  if (error) throw error;
  return new Map((data ?? []).map((r, i) => [r.problem_id as number, i + 1]));
}
