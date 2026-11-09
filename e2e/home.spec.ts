import { test, expect } from "@playwright/test";

test("หน้าแรกแสดงชื่อระบบเป็นภาษาไทย", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("SQL Quick Quiz");
  await expect(
    page.getByRole("heading", { level: 1, name: "SQL Quick Quiz" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
});

test("หน้าแรกไม่ล้นจอแนวนอนบนมือถือ", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
