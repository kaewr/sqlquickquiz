import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type StudentProfile = {
  user_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  section: string;
  password_changed: boolean;
  is_active: boolean;
};

export type Viewer =
  | { kind: "anonymous" }
  | { kind: "student"; userId: string; profile: StudentProfile }
  | { kind: "instructor"; userId: string; email: string }
  | { kind: "other"; userId: string; email: string | null };

/** ผู้ใช้ปัจจุบันและบทบาท (ตรวจจากฐานข้อมูลเสมอ ไม่เชื่อค่าจาก client) */
export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { kind: "anonymous" };

  const userId = claims.sub;
  const email = (claims.email as string | undefined) ?? null;

  const { data: isInstructor } = await supabase.rpc("is_instructor");
  if (isInstructor) return { kind: "instructor", userId, email: email ?? "" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, student_id, first_name, last_name, section, password_changed, is_active")
    .eq("user_id", userId)
    .maybeSingle<StudentProfile>();
  if (profile) return { kind: "student", userId, profile };

  return { kind: "other", userId, email };
}

/**
 * ใช้บรรทัดแรกของทุก server route ของอาจารย์ — ก่อนแตะ service key
 * คืน { error } เป็น Response 401/403 ถ้าไม่ผ่าน
 */
export async function requireInstructor(): Promise<
  { ok: true; userId: string } | { ok: false; error: NextResponse }
> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    return { ok: false, error: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  }
  const { data: isInstructor, error } = await supabase.rpc("is_instructor");
  if (error || !isInstructor) {
    return { ok: false, error: NextResponse.json({ error: "NOT_INSTRUCTOR" }, { status: 403 }) };
  }
  return { ok: true, userId };
}
