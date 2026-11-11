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

test("ทุกหน้ามี security header: ห้ามฝังใน iframe, nosniff, referrer policy", async ({ request }) => {
  for (const path of ["/", "/admin", "/r/no-such-token-abcdefgh1234"]) {
    const h = (await request.get(path, { maxRedirects: 0 })).headers();
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
  }
});
