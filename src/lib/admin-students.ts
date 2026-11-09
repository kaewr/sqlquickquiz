import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** หานิสิตจาก user_id (ต้องมี profile — กันการแก้บัญชีอาจารย์หรือบัญชีอื่น) */
export async function findStudent(userId: string) {
  if (!UUID.test(userId)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("user_id, student_id")
    .eq("user_id", userId)
    .maybeSingle<{ user_id: string; student_id: string }>();
  return data;
}

/** ระยะเวลา ban ของบัญชีที่ปิด (~100 ปี) */
export const BAN_FOREVER = "876000h";
