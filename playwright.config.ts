import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // หน้านิสิตต้องใช้งานบนมือถือได้ดี
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // ถ้าตั้ง PLAYWRIGHT_BASE_URL (เช่นทดสอบบน Vercel preview) จะไม่สตาร์ตเซิร์ฟเวอร์เอง
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
