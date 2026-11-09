import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** หานิสิตจาก user_id (ต้องมี profile — กันการแก้บัญชีอาจารย์หรือบัญชีอื่น) */
export async function findStudent(userId: string) {
  if (!UUID.test(userId)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("user_id, student_id")
    .eq("user_id", userId)
    .maybeSingle<{ user_id: string; student_id: string }>();
  if (error) throw error; // เช่น service key ไม่ถูกต้อง — ให้ adminRouteError แจ้ง ไม่ใช่ตอบว่า "ไม่พบ"
  return data;
}

/** ระยะเวลา ban ของบัญชีที่ปิด (~100 ปี) */
export const BAN_FOREVER = "876000h";
