import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  createStudent,
  deleteStudentById,
  sessionCookies,
  tryStudentLogin,
  type TestStudent,
} from "./support/supabase";

let student: TestStudent;

test.beforeEach(async () => {
  student = await createStudent();
});
test.afterEach(async () => {
  await deleteStudentById(student.studentId);
});

async function login(page: Page, studentId: string, password: string) {
  await page.goto("/");
  await page.getByLabel("รหัสนิสิต").fill(studentId);
  await page.getByLabel("รหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
}

test("ล็อกอินด้วยรหัสนิสิต เห็นชื่อ แท็บ และแถบเตือนเปลี่ยนรหัสผ่าน", async ({ page }) => {
  await login(page, student.studentId, student.password);

  await expect(page.getByTestId("student-name")).toContainText(student.studentId);
  await expect(page.getByRole("tab", { name: "โจทย์ปัจจุบัน" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "ประวัติของฉัน" })).toBeVisible();
  await expect(page.getByTestId("password-banner")).toBeVisible();

  // ไม่ล้นจอแนวนอน (มือถือ)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // เข้าซ้ำ (รีโหลด) แถบเตือนยังอยู่
  await page.reload();
  await expect(page.getByTestId("password-banner")).toBeVisible();
});

test("กรอกรหัสผ่านผิดแสดงข้อความไทย และกรอกผิดหลายครั้งก็ไม่ปิดบัญชี", async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await login(page, student.studentId, "wrong-password");
    await expect(page.locator(`p[role="alert"]`)).toHaveText("รหัสนิสิตหรือรหัสผ่านไม่ถูกต้อง");
  }
  await login(page, student.studentId, student.password);
  await expect(page.getByTestId("student-name")).toBeVisible();
});

test("รหัสนิสิตผิดรูปแบบแสดงข้อความไทย", async ({ page }) => {
  await login(page, "1234", "whatever1");
  await expect(page.locator(`p[role="alert"]`)).toHaveText("รหัสนิสิตต้องเป็นตัวเลข 8 หลัก");
});

test("เปลี่ยนรหัสผ่าน: รหัสเดิมผิด / ไม่ตรงกัน ถูกปฏิเสธ, สำเร็จแล้วแถบเตือนหายและใช้รหัสใหม่ได้", async ({ page }) => {
  await login(page, student.studentId, student.password);
  await expect(page.getByTestId("password-banner")).toBeVisible();

  await page.getByRole("button", { name: "บัญชี" }).click();
  await page.getByRole("menuitem", { name: "เปลี่ยนรหัสผ่าน" }).click();
  const dialog = page.getByRole("dialog", { name: "เปลี่ยนรหัสผ่าน" });
  await expect(dialog).toBeVisible();

  // รหัสเดิมผิด
  await dialog.getByLabel("รหัสผ่านเดิม").fill("not-my-password");
  await dialog.getByLabel("รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)").fill("NewPass#2026");
  await dialog.getByLabel("ยืนยันรหัสผ่านใหม่").fill("NewPass#2026");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("รหัสผ่านเดิมไม่ถูกต้อง");

  // ยืนยันไม่ตรงกัน
  await dialog.getByLabel("รหัสผ่านเดิม").fill(student.password);
  await dialog.getByLabel("รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)").fill("NewPass#2026");
  await dialog.getByLabel("ยืนยันรหัสผ่านใหม่").fill("NewPass#2027");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");

  // สำเร็จ
  await dialog.getByLabel("รหัสผ่านเดิม").fill(student.password);
  await dialog.getByLabel("รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)").fill("NewPass#2026");
  await dialog.getByLabel("ยืนยันรหัสผ่านใหม่").fill("NewPass#2026");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await expect(dialog.getByRole("status")).toHaveText("เปลี่ยนรหัสผ่านเรียบร้อยแล้ว");
  await dialog.getByRole("button", { name: "ปิด" }).click();

  // แถบเตือนหายทันทีและหลังรีโหลด
  await expect(page.getByTestId("password-banner")).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("student-name")).toBeVisible();
  await expect(page.getByTestId("password-banner")).toBeHidden();

  // ออกจากระบบ แล้วรหัสเดิมใช้ไม่ได้ รหัสใหม่ใช้ได้
  await page.getByRole("button", { name: "บัญชี" }).click();
  await page.getByRole("menuitem", { name: "ออกจากระบบ" }).click();
  await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeVisible();

  expect(await tryStudentLogin(student.studentId, student.password)).toBe("invalid_credentials");
  await login(page, student.studentId, "NewPass#2026");
  await expect(page.getByTestId("student-name")).toBeVisible();
  await expect(page.getByTestId("password-banner")).toBeHidden();
});

test("บัญชีที่ถูกปิดล็อกอินไม่ได้ และเห็นข้อความไทย", async ({ page }) => {
  const admin = adminClient();
  await admin.auth.admin.updateUserById(student.userId, { ban_duration: "876000h" });
  await admin.from("profiles").update({ is_active: false }).eq("user_id", student.userId);

  await login(page, student.studentId, student.password);
  await expect(page.locator(`p[role="alert"]`)).toHaveText("บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่ออาจารย์");
});

test("นิสิตเข้า /admin ไม่ได้ และเรียก API ของอาจารย์ไม่ได้", async ({ page, context, baseURL }) => {
  await context.addCookies(
    await sessionCookies(`${student.studentId}@quiz.local`, student.password, baseURL!),
  );

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึง" })).toBeVisible();
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึง" })).toBeVisible();
  await expect(page.getByText("65000001")).toHaveCount(0); // ไม่เห็นรายชื่อนิสิตจาก seed

  const res = await page.request.post("/api/admin/students/import", {
    data: { rows: [{ line: 2, student_id: "69999999", first_name: "a", last_name: "b", section: "1" }] },
  });
  expect(res.status()).toBe(403);
  const reset = await page.request.post(`/api/admin/students/${student.userId}/reset-password`);
  expect(reset.status()).toBe(403);
});

test("ผู้ไม่ล็อกอินเรียก API ของอาจารย์ไม่ได้", async ({ request }) => {
  const res = await request.post("/api/admin/students/import", { data: { rows: [] } });
  expect(res.status()).toBe(401);
});
