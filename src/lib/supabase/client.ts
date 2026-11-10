import { createBrowserClient } from "@supabase/ssr";

/** Supabase client ฝั่งเบราว์เซอร์ (session จาก cookie เดียวกับฝั่งเซิร์ฟเวอร์) — ใช้กับ realtime/polling */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
