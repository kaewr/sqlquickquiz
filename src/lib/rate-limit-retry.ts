/**
 * ลองใหม่อัตโนมัติเมื่อ Supabase Auth ตอบ over_request_rate_limit
 *
 * เพดานล็อกอินเป็น token bucket ต่อ IP (ถัง 30 + เติมตาม Token refresh ที่ตั้ง, ตอนนี้ 20/วินาที)
 * และทั้งห้องล็อกอินผ่าน server เดียวกัน — ตอนทั้งห้องกดพร้อมกัน คนที่ช้ากว่าจะโดนเพดานชั่วครู่
 * จึงรอแบบสุ่ม (กันทุกคนลองพร้อมกันอีก) แล้วลองใหม่ รวมไม่เกินราว 10 วินาที
 * ดู docs/LOADTEST.md
 */
export const RATE_LIMIT_CODE = "over_request_rate_limit";

type Result = { error: { code?: string } | null };

export async function withRateLimitRetry<T extends Result>(
  fn: () => Promise<T>,
  {
    attempts = 6,
    minDelayMs = 1000,
    maxDelayMs = 2500,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  }: { attempts?: number; minDelayMs?: number; maxDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  let result = await fn();
  for (let i = 1; i < attempts && result.error?.code === RATE_LIMIT_CODE; i++) {
    await sleep(minDelayMs + Math.random() * (maxDelayMs - minDelayMs));
    result = await fn();
  }
  return result;
}
