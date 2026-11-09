import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client ที่ใช้ service key — ข้าม RLS ทั้งหมด
 * ใช้ได้เฉพาะใน server route ที่ผ่าน requireInstructor() แล้วเท่านั้น
 */
export class MissingServiceKeyError extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
}

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new MissingServiceKeyError();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client ชั่วคราวที่ไม่เก็บ session — ใช้ตรวจรหัสผ่านเดิมโดยไม่กระทบ session ปัจจุบัน */
export function createEphemeralClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
