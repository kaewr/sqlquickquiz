import { test, expect, type Page } from "@playwright/test";
import {
  INSTRUCTOR,
  adminClient,
  createStudent,
  deleteStudentById,
  randomStudentId,
  sessionCookies,
  tryStudentLogin,
} from "./support/supabase";

const cleanup: string[] = [];
test.afterEach(async () => {
  while (cleanup.length) await deleteStudentById(cleanup.pop()!);
});

async function asInstructor(page: Page, baseURL: string) {
  await page.context().addCookies(await sessionCookies(INSTRUCTOR.email, INSTRUCTOR.password, baseURL));
}

const alertBox = (page: Page) => page.locator(`p[role="alert"]`);

async function confirmAction(page: Page, studentId: string, button: string) {
  await page.getByTestId(`student-row-${studentId}`).getByRole("button", { name: button }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "ยืนยัน" }).click();
}

test("ผู้ไม่ล็อกอินเห็นปุ่มเข้าสู่ระบบด้วย Google ซึ่งพาไปหน้า authorize ของ Google ผ่าน Supabase", async ({ page }) => {
  await page.goto("/admin");
  const button = page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" });
  await expect(button).toBeVisible();

  const authorize = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize") && r.url().includes("provider=google"));
  await button.click();
  const req = await authorize;
  expect(new URL(req.url()).searchParams.get("redirect_to")).toContain("/auth/callback");
});

test("Google ที่ไม่มีบัญชีในระบบ (ปิดการสมัคร) เห็นข้อความไทย", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_code=signup_disabled");
  await expect(alertBox(page)).toHaveText("บัญชีนี้ไม่มีสิทธิ์เข้าใช้ระบบ");
});

test("ผู้ใช้ Google ที่ไม่อยู่ใน instructors ถูกปฏิเสธ", async ({ page, baseURL }) => {
  // ผู้ใช้ทั่วไปที่ไม่มีอีเมลใน instructors
  const admin = adminClient();
  const email = `stranger-${Date.now()}@example.com`;
  const { data } = await admin.auth.admin.createUser({ email, password: "Stranger#2026", email_confirm: true });
  try {
    await page.context().addCookies(await sessionCookies(email, "Stranger#2026", baseURL!));
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึง" })).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(data.user!.id);
  }
});

test("อาจารย์เห็นหน้าอาจารย์และรายชื่อนิสิต", async ({ page, baseURL }) => {
  await asInstructor(page, baseURL!);
  await page.goto("/admin");
  await expect(page.getByTestId("admin-email")).toHaveText(INSTRUCTOR.email);
  await page.getByRole("link", { name: /จัดการนิสิต/ }).click();
  await expect(page.getByRole("heading", { name: "นิสิต", exact: true })).toBeVisible();
  await expect(page.getByTestId("student-row-65000001")).toBeVisible();
});

test("นำเข้า CSV: BOM, แจ้งแถวผิด, สร้างใหม่ และอัปเดตรหัสเดิม", async ({ page, baseURL }) => {
  const existing = await createStudent();
  const newA = randomStudentId();
  const newB = randomStudentId();
  cleanup.push(existing.studentId, newA, newB);

  const csv =
    "﻿student_id,first_name,last_name,section\r\n" +
    `${newA},สมใจ,ทดสอบ,1\r\n` +
    `${newB},"มานะ, จริง",ใจดี,2\r\n` +
    `${existing.studentId},ชื่อใหม่,นามสกุลใหม่,3\r\n` +
    `${newA},ซ้ำ,ซ้ำ,1\r\n` + // รหัสซ้ำในไฟล์
    `69000001,,ไม่มีชื่อ,1\r\n` + // ช่องว่าง
    `1234,ผิด,รูปแบบ,1\r\n` + // รหัสไม่ถูกรูปแบบ
    "\r\n";

  await asInstructor(page, baseURL!);
  await page.goto("/admin/students");
  await page.getByTestId("csv-file").setInputFiles({
    name: "students.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8"),
  });

  await expect(page.getByTestId("csv-valid-count")).toHaveText("3");
  await expect(page.getByTestId("csv-error-count")).toHaveText("3");
  const errors = page.getByTestId("csv-errors");
  await expect(errors).toContainText("บรรทัด 5");
  await expect(errors).toContainText("รหัสซ้ำกับบรรทัด 2");
  await expect(errors).toContainText("ไม่มีชื่อ");
  await expect(errors).toContainText("รหัสนิสิตต้องเป็นตัวเลข 8 หลัก");

  await page.getByRole("button", { name: "ยืนยันนำเข้า 3 แถว" }).click();
  await expect(page.getByTestId("csv-result")).toContainText("สร้างใหม่ 2 คน · อัปเดต 1 คน");

  // รายชื่อในตาราง
  await expect(page.getByTestId(`student-row-${newB}`)).toContainText("มานะ, จริง ใจดี");
  await expect(page.getByTestId(`student-row-${existing.studentId}`)).toContainText("ชื่อใหม่ นามสกุลใหม่");

  // บัญชีใหม่ล็อกอินด้วยรหัสนิสิตได้ บัญชีเดิมไม่ถูกสร้างซ้ำ (รหัสผ่านเดิมยังใช้ได้)
  expect(await tryStudentLogin(newA, newA)).toBeNull();
  expect(await tryStudentLogin(existing.studentId, existing.password)).toBeNull();
  const { count } = await adminClient()
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("student_id", existing.studentId);
  expect(count).toBe(1);
});

test("CSV ที่หัวตารางไม่ครบถูกปฏิเสธ", async ({ page, baseURL }) => {
  await asInstructor(page, baseURL!);
  await page.goto("/admin/students");
  await page.getByTestId("csv-file").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("id,name\n65000001,a\n", "utf-8"),
  });
  await expect(alertBox(page)).toContainText("หัวตารางไม่ครบ");
});

test("รีเซ็ตรหัสผ่านกลับเป็นรหัสนิสิต และแถบเตือนกลับมา", async ({ page, baseURL }) => {
  const s = await createStudent({ password: "Changed#2026", passwordChanged: true });
  cleanup.push(s.studentId);

  await asInstructor(page, baseURL!);
  await page.goto("/admin/students");
  await confirmAction(page, s.studentId, "รีเซ็ตรหัส");
  await expect(page.getByRole("status").filter({ hasText: "รีเซ็ตรหัสผ่าน" })).toBeVisible();

  expect(await tryStudentLogin(s.studentId, s.studentId)).toBeNull();
  expect(await tryStudentLogin(s.studentId, "Changed#2026")).toBe("invalid_credentials");
  const { data } = await adminClient().from("profiles").select("password_changed").eq("user_id", s.userId).single();
  expect(data!.password_changed).toBe(false);
});

test("ปิดบัญชีแล้วล็อกอินไม่ได้ เปิดคืนแล้วล็อกอินได้", async ({ page, baseURL }) => {
  const s = await createStudent();
  cleanup.push(s.studentId);

  await asInstructor(page, baseURL!);
  await page.goto("/admin/students");
  const row = page.getByTestId(`student-row-${s.studentId}`);
  await confirmAction(page, s.studentId, "ปิดบัญชี");
  await expect(page.getByRole("status").filter({ hasText: `ปิดบัญชี ${s.studentId} แล้ว` })).toBeVisible();
  await expect(row.getByRole("button", { name: "เปิดบัญชี" })).toBeVisible();
  expect(await tryStudentLogin(s.studentId, s.password)).toBe("user_banned");

  await confirmAction(page, s.studentId, "เปิดบัญชี");
  await expect(page.getByRole("status").filter({ hasText: `เปิดบัญชี ${s.studentId} แล้ว` })).toBeVisible();
  await expect(row.getByRole("button", { name: "ปิดบัญชี" })).toBeVisible();
  expect(await tryStudentLogin(s.studentId, s.password)).toBeNull();
});

test("ลบได้เฉพาะนิสิตที่ยังไม่เคยส่ง", async ({ page, baseURL }) => {
  const fresh = await createStudent();
  const submitted = await createStudent();
  cleanup.push(fresh.studentId, submitted.studentId);

  // ให้ submitted ส่งคำตอบ 1 ข้อ (ข้อ 1 ใน seed เปิดอยู่)
  const client = adminClient();
  const { data: problem } = await client.from("problem_status").select("problem_id").eq("is_open", true).limit(1).single();
  const { createClient } = await import("@supabase/supabase-js");
  const studentClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  await studentClient.auth.signInWithPassword({ email: `${submitted.studentId}@quiz.local`, password: submitted.password });
  const { error } = await studentClient.rpc("submit_answer", { p_problem_id: problem!.problem_id, p_sql_text: "SELECT 1;" });
  expect(error).toBeNull();

  await asInstructor(page, baseURL!);
  await page.goto("/admin/students");

  // คนที่เคยส่ง: ปุ่มลบใช้ไม่ได้ และ API ตอบ 409
  await expect(page.getByTestId(`student-row-${submitted.studentId}`).getByRole("button", { name: "ลบ" })).toBeDisabled();
  const res = await page.request.delete(`/api/admin/students/${submitted.userId}`);
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe("STUDENT_HAS_SUBMISSIONS");

  // คนที่ยังไม่เคยส่ง: ลบได้
  await confirmAction(page, fresh.studentId, "ลบ");
  await expect(page.getByTestId(`student-row-${fresh.studentId}`)).toHaveCount(0);
  expect(await tryStudentLogin(fresh.studentId, fresh.password)).toBe("invalid_credentials");
});
