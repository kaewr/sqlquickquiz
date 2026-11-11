"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEphemeralClient } from "@/lib/supabase/admin";
import { isValidStudentId, studentEmail, MIN_PASSWORD_LENGTH } from "@/lib/student-id";
import { thaiError } from "@/lib/errors";
import { withRateLimitRetry } from "@/lib/rate-limit-retry";

export type FormState = { error?: string; success?: string };

/** นิสิตล็อกอินด้วยรหัสนิสิต + รหัสผ่าน (กรอกผิดแค่แจ้งเตือน ไม่ล็อกบัญชี) */
export async function studentLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const studentId = String(formData.get("student_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!isValidStudentId(studentId)) return { error: thaiError("INVALID_STUDENT_ID") };
  if (!password) return { error: thaiError("invalid_credentials") };

  const supabase = await createClient();
  // ทั้งห้องกดพร้อมกัน → บางคนโดนเพดานชั่วครู่ ลองใหม่เองโดยนิสิตไม่ต้องกดซ้ำ
  const { error } = await withRateLimitRetry(() =>
    supabase.auth.signInWithPassword({
      email: studentEmail(studentId),
      password,
    }),
  );
  if (error) return { error: thaiError(error.code ?? "invalid_credentials") };

  redirect("/");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function logoutToAdmin(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin");
}

/**
 * นิสิตเปลี่ยนรหัสผ่านเอง — ไม่ใช้ service key
 * 1) ตรวจรหัสเดิมด้วย client ชั่วคราว  2) เปลี่ยนด้วย session ของนิสิต  3) mark_password_changed
 */
export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const oldPassword = String(formData.get("old_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) return { error: thaiError("weak_password") };
  if (newPassword !== confirmPassword) return { error: thaiError("PASSWORD_MISMATCH") };
  if (newPassword === oldPassword) return { error: thaiError("same_password") };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { error: thaiError("UNAUTHENTICATED") };

  const { data: profile } = await supabase
    .from("profiles")
    .select("student_id")
    .eq("user_id", userId)
    .maybeSingle<{ student_id: string }>();
  if (!profile) return { error: thaiError("NOT_STUDENT_ACCOUNT") };

  const verifier = createEphemeralClient();
  const { error: verifyError } = await withRateLimitRetry(() =>
    verifier.auth.signInWithPassword({
      email: studentEmail(profile.student_id),
      password: oldPassword,
    }),
  );
  if (verifyError) {
    return {
      error: verifyError.code === "invalid_credentials" ? thaiError("WRONG_OLD_PASSWORD") : thaiError(verifyError.code),
    };
  }
  // เปลี่ยนด้วย session ที่เพิ่งยืนยันรหัสเดิม (ไม่ใช่ session เก่าของเบราว์เซอร์)
  // เพราะเปิด secure_password_change: session เก่าเกิน 24 ชม. ต้องยืนยันทางอีเมล ซึ่งบัญชีนิสิตไม่มีจริง
  const { error: updateError } = await verifier.auth.updateUser({ password: newPassword });
  await verifier.auth.signOut({ scope: "local" });
  if (updateError) return { error: thaiError(updateError.code) };

  const { error: markError } = await supabase.rpc("mark_password_changed");
  if (markError) return { error: thaiError(null) };

  return { success: "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" };
}

/** อาจารย์ล็อกอินด้วย Google */
export async function instructorGoogleLogin(): Promise<void> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/admin?error=OAUTH_FAILED");
  redirect(data.url);
}
