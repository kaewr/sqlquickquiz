import "server-only";
import { NextResponse } from "next/server";
import { MissingServiceKeyError } from "@/lib/supabase/admin";

/** แปลงข้อผิดพลาดที่ไม่คาดคิดใน server route ของอาจารย์เป็น JSON ที่หน้าเว็บแปลได้ + log ไว้ดูใน Vercel */
export function adminRouteError(route: string, error: unknown) {
  console.error(`[admin:${route}]`, error);
  const code =
    error instanceof MissingServiceKeyError
      ? "SERVER_MISCONFIGURED"
      : isKeyRejected(error as { message?: string; status?: number })
        ? "SERVICE_KEY_REJECTED"
        : "SERVER_ERROR";
  return NextResponse.json({ error: code }, { status: 500 });
}

/**
 * ข้อผิดพลาดจาก PostgREST/Auth ที่เกิดจาก key ไม่ถูกต้อง
 * - 401 / "Invalid API key": key ไม่ถูกต้อง
 * - 42501 permission denied: key ใช้ได้แต่ไม่ใช่ service role (เช่นใส่ publishable key ผิดช่อง)
 *   — service role ข้าม RLS และมีสิทธิ์ทุกตาราง จึงไม่ควรเจอ 42501
 */
export function isKeyRejected(error: { message?: string; code?: string; status?: number } | null | undefined) {
  if (!error) return false;
  return (
    error.status === 401 ||
    error.code === "42501" ||
    /invalid api key|jwt|unauthorized|no api key/i.test(error.message ?? "")
  );
}
