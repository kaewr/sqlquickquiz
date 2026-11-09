import { defineConfig, devices } from "@playwright/test";

// เทสต์ใช้ Supabase บนเครื่อง: ค่าจาก .env.local (ถ้ามี)
try {
  process.loadEnvFile(".env.local");
} catch {
  // ไม่มีไฟล์ (เช่นทดสอบ Vercel ด้วย PLAYWRIGHT_BASE_URL) — ข้ามได้
}

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
// ทดสอบเว็บที่ deploy แล้ว: รันเฉพาะเทสต์ที่ไม่แตะฐานข้อมูล
const remote = !!process.env.PLAYWRIGHT_BASE_URL;
const dbSpecs = remote ? ["**/student.spec.ts", "**/admin.spec.ts"] : [];

export default defineConfig({
  testDir: "./e2e",
  testIgnore: dbSpecs,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  // next dev compile หน้าตอนเปิดครั้งแรก อาจนานกว่า 5 วินาที
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // หน้านิสิตต้องใช้งานบนมือถือได้ดี (หน้าอาจารย์ทดสอบบนจอคอมอย่างเดียว)
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: [...dbSpecs, "**/admin.spec.ts"] },
  ],
  webServer: remote
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
