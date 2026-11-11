import { test, expect } from "@playwright/test";

// เครื่องตั้งโหมดมืดไว้ แต่เว็บต้องเริ่มที่โหมดสว่าง แล้วสลับ/จำค่าได้
test.use({ colorScheme: "dark" });

const bg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("โหมดสี: ค่าเริ่มต้นสว่าง (ไม่ตามเครื่อง), กดสลับเป็นมืด, รีโหลดแล้วยังจำ, สลับกลับได้", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", "dark");
  expect(await bg(page)).toBe("rgb(255, 255, 255)");

  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toHaveAttribute("aria-label", "เปลี่ยนเป็นโหมดมืด");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await bg(page)).toBe("rgb(19, 16, 26)");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "เปลี่ยนเป็นโหมดสว่าง");

  await page.getByTestId("theme-toggle").click();
  await expect(html).not.toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).not.toHaveAttribute("data-theme", "dark");
  expect(await bg(page)).toBe("rgb(255, 255, 255)");
});
