import "server-only";
import { headers } from "next/headers";

/** URL หน้าอันดับสาธารณะ /r/[token] — ใช้ NEXT_PUBLIC_SITE_URL ถ้าตั้งไว้ ไม่งั้นใช้ host ของ request */
export async function rankingUrl(token: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  const origin = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : "");
  return `${origin.replace(/\/$/, "")}/r/${token}`;
}
