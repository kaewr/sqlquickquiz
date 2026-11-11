import { test, expect } from "@playwright/test";
import { withRateLimitRetry, RATE_LIMIT_CODE } from "../src/lib/rate-limit-retry";

// ฟังก์ชันล้วน ไม่ต้องใช้เบราว์เซอร์ — รันใน project เดียวพอ
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop"));

const limited = { error: { code: RATE_LIMIT_CODE } };
const ok = { error: null };
const noSleep = async () => {};

test("ล็อกอินโดนเพดาน: ลองใหม่จนผ่าน", async () => {
  const replies = [limited, limited, ok];
  let calls = 0;
  const r = await withRateLimitRetry(async () => replies[calls++], { sleep: noSleep });
  expect(r).toEqual(ok);
  expect(calls).toBe(3);
});

test("ล็อกอินโดนเพดานตลอด: หยุดตามจำนวนครั้งที่กำหนด แล้วคืนข้อผิดพลาดเดิม", async () => {
  let calls = 0;
  const waits: number[] = [];
  const r = await withRateLimitRetry(
    async () => {
      calls++;
      return limited;
    },
    { attempts: 4, sleep: async (ms) => void waits.push(ms) },
  );
  expect(r).toEqual(limited);
  expect(calls).toBe(4);
  expect(waits).toHaveLength(3);
  for (const w of waits) {
    expect(w).toBeGreaterThanOrEqual(1000);
    expect(w).toBeLessThanOrEqual(2500);
  }
});

test("ข้อผิดพลาดอื่น (รหัสผิด) ไม่ลองใหม่", async () => {
  let calls = 0;
  const r = await withRateLimitRetry(async () => {
    calls++;
    return { error: { code: "invalid_credentials" } };
  }, { sleep: noSleep });
  expect(r.error?.code).toBe("invalid_credentials");
  expect(calls).toBe(1);
});
