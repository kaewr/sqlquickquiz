import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminSubmission = {
  id: number;
  submit_order: number;
  submitted_at: string;
  sql_text: string;
  student_user_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  section: string;
};

export type RosterStudent = {
  user_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  section: string;
};

type SubRow = Omit<AdminSubmission, "student_id" | "first_name" | "last_name" | "section"> & {
  profiles: { student_id: string; first_name: string; last_name: string; section: string } | null;
};

/** คำตอบทั้งหมดของข้อ (อาจารย์อ่านได้ทุกคนผ่าน RLS) — ใช้ได้ทั้ง server/browser */
export async function fetchSubmissions(supabase: SupabaseClient, problemId: number): Promise<AdminSubmission[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select("id, submit_order, submitted_at, sql_text, student_user_id, profiles(student_id, first_name, last_name, section)")
    .eq("problem_id", problemId)
    .order("submit_order")
    .range(0, 4999)
    .overrideTypes<SubRow[], { merge: false }>();
  if (error) throw error;
  return (data ?? []).map(({ profiles, ...s }) => ({
    ...s,
    student_id: profiles?.student_id ?? "",
    first_name: profiles?.first_name ?? "",
    last_name: profiles?.last_name ?? "",
    section: profiles?.section ?? "",
  }));
}

/** รายชื่อนิสิตที่บัญชียังเปิดอยู่ (ใช้หาคนที่ยังไม่ส่ง) */
export async function fetchActiveRoster(supabase: SupabaseClient): Promise<RosterStudent[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, student_id, first_name, last_name, section")
    .eq("is_active", true)
    .order("section")
    .order("student_id")
    .range(0, 4999);
  if (error) throw error;
  return data ?? [];
}
