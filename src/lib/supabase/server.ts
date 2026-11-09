import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

/** Supabase client ของผู้ใช้ปัจจุบัน (อ่าน/เขียน session ผ่าน cookie) — RLS มีผลเต็มที่ */
export async function createClient() {
  // ข้อมูลผู้ใช้ต้องอ่านตอน request เสมอ (ห้าม prerender) — Cache Components
  await connection();
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // เรียกจาก Server Component ตั้ง cookie ไม่ได้ — proxy.ts ต่ออายุ session ให้แล้ว
          }
        },
      },
    },
  );
}
