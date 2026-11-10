import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fetchPublicResults } from "@/lib/public-results";

export async function proxy(request: NextRequest) {
  // หน้าอันดับสาธารณะ: ตรวจ token ก่อน render เพื่อตอบ 404 จริง
  // (notFound() ภายใน <Suspense> ตอบ 200 เพราะเริ่มส่งหน้าไปแล้ว) — ไม่ต้องใช้ session
  const ranking = request.nextUrl.pathname.match(/^\/r\/([^/]+)\/?$/);
  if (ranking) {
    const rows = await fetchPublicResults(decodeURIComponent(ranking[1]));
    if (rows.length === 0) {
      return NextResponse.rewrite(new URL("/r-missing", request.url), { status: 404 });
    }
    return NextResponse.next();
  }

  // ต่ออายุ session ของ Supabase ก่อนหน้าเว็บอ่าน cookie
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
