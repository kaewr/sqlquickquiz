import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** ปลายทางหลังล็อกอิน Google: แลก code เป็น session แล้วกลับหน้าอาจารย์ */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = "/admin"; // ปลายทางคงที่ ไม่รับจาก query (กัน open redirect)

  // Supabase ส่ง error กลับมา เช่น บัญชี Google ที่ไม่มีอยู่ในระบบ (ปิดการสมัครเอง)
  const oauthError = searchParams.get("error_code") ?? searchParams.get("error");
  if (oauthError) {
    const code = oauthError === "signup_disabled" ? "signup_disabled" : "OAUTH_FAILED";
    return NextResponse.redirect(`${origin}/admin?error=${code}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/admin?error=OAUTH_FAILED`);
}
