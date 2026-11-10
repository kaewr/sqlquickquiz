import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  createProblem,
  createStudent,
  deleteProblem,
  deleteStudentById,
  sessionCookies,
  setProblemOpen,
  submitAs,
  type TestStudent,
} from "./support/supabase";

let student: TestStudent;
const problems: number[] = [];
const extraStudents: string[] = [];

test.beforeEach(async () => {
  student = await createStudent();
});
test.afterEach(async () => {
  while (problems.length) await deleteProblem(problems.pop()!);
  await deleteStudentById(student.studentId);
  while (extraStudents.length) await deleteStudentById(extraStudents.pop()!);
});

async function openAs(page: Page, s: TestStudent, baseURL: string) {
  await page.context().addCookies(await sessionCookies(`${s.studentId}@quiz.local`, s.password, baseURL));
  await page.goto("/");
  await expect(page.getByTestId("realtime-status")).toHaveAttribute("data-state", "connected");
}

async function newStudentPage(browser: Browser, s: TestStudent, baseURL: string, options = {}) {
  const context = await browser.newContext({ baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok", ...options });
  const page = await context.newPage();
  await openAs(page, s, baseURL);
  return page;
}

const card = (page: Page, id: number) => page.getByTestId(`problem-${id}`);

async function fillAndConfirm(page: Page, id: number, sql: string) {
  await card(page, id).getByLabel("คำสั่ง SQL ของคุณ").fill(sql);
  await card(page, id).getByRole("button", { name: "ส่งคำตอบ" }).click();
  const dialog = page.getByRole("dialog", { name: "ยืนยันการส่งคำตอบ" });
  await expect(dialog).toContainText("ส่งได้ครั้งเดียว แก้ไม่ได้");
  await dialog.getByRole("button", { name: "ยืนยันส่ง" }).click();
}

test("แสดงโจทย์ที่เปิดอยู่ (markdown) และส่งสำเร็จได้ใบยืนยัน ซึ่งยังอยู่หลังรีโหลด", async ({ page, baseURL }) => {
  const id = await createProblem({ title: "เลือกเมือง" });
  problems.push(id);
  await openAs(page, student, baseURL!);

  const c = card(page, id);
  await expect(c.getByRole("heading", { name: "เลือกเมือง" })).toBeVisible();
  await expect(c.locator("strong", { hasText: "ชื่อเมือง" })).toBeVisible(); // markdown ตัวหนา
  await expect(c.getByRole("table")).toContainText("Bangkok"); // ตาราง GFM
  await expect(c).not.toContainText("SECRET_SOLUTION"); // ไม่มีเฉลย
  await expect(c.getByTestId("submission-count")).toHaveText("0");

  // ตัวนับความยาว
  await c.getByLabel("คำสั่ง SQL ของคุณ").fill("SELECT Name FROM city;");
  await expect(c.getByTestId("sql-length")).toContainText("22 / 10,000");

  await fillAndConfirm(page, id, "SELECT Name FROM city;");
  await expect(c.getByTestId("receipt")).toContainText("ส่งแล้ว");
  await expect(c.getByTestId("receipt-order")).toHaveText("1");
  await expect(c.getByLabel("คำสั่ง SQL ของคุณ")).toHaveCount(0); // แสดงสถานะแทนฟอร์ม
  await expect(c.getByTestId("submission-count")).toHaveText("1");

  // ไม่ล้นจอแนวนอน (มือถือ)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.reload();
  await expect(card(page, id).getByTestId("receipt-order")).toHaveText("1");
  await expect(card(page, id).getByLabel("คำสั่ง SQL ของคุณ")).toHaveCount(0);
});

test("ส่งซ้ำไม่ได้: อีกอุปกรณ์กดยืนยันหลังส่งไปแล้วได้ข้อความไทยและเห็นใบยืนยันเดิม", async ({ page, browser, baseURL }) => {
  const id = await createProblem();
  problems.push(id);
  await openAs(page, student, baseURL!);
  // นิสิตคนเดิมบนอีกอุปกรณ์ (context แยก) เปิดหน้าต่างยืนยันค้างไว้ก่อน
  const other = await newStudentPage(browser, student, baseURL!);
  const otherCard = card(other, id);
  await otherCard.getByLabel("คำสั่ง SQL ของคุณ").fill("SELECT 2;");
  await otherCard.getByRole("button", { name: "ส่งคำตอบ" }).click();
  const otherDialog = other.getByRole("dialog", { name: "ยืนยันการส่งคำตอบ" });
  await expect(otherDialog).toBeVisible();

  await fillAndConfirm(page, id, "SELECT 1;");
  await expect(card(page, id).getByTestId("receipt-order")).toHaveText("1");

  // ยืนยันจากอุปกรณ์ที่สอง → ฐานข้อมูลปฏิเสธ
  await otherDialog.getByRole("button", { name: "ยืนยันส่ง" }).click();
  await expect(otherCard.locator(`p[role="alert"]`)).toHaveText("คุณส่งคำตอบข้อนี้ไปแล้ว ส่งซ้ำไม่ได้");
  await expect(otherCard.getByTestId("receipt-order")).toHaveText("1");
  await expect(otherCard.getByTestId("submission-count")).toHaveText("1");
  await other.context().close();
});

test("SQL ยาวเกิน 10,000 ตัวอักษรกดส่งไม่ได้", async ({ page, baseURL }) => {
  const id = await createProblem();
  problems.push(id);
  await openAs(page, student, baseURL!);
  await card(page, id).getByLabel("คำสั่ง SQL ของคุณ").fill("x".repeat(10_001));
  await expect(card(page, id).getByTestId("sql-length")).toContainText("10,001 / 10,000");
  await expect(card(page, id).getByRole("button", { name: "ส่งคำตอบ" })).toBeDisabled();
});

test("อาจารย์เปิดโจทย์ใหม่ → การ์ดปรากฏเองโดยไม่ต้องรีเฟรช", async ({ page, baseURL }) => {
  const id = await createProblem({ title: "ข้อที่เพิ่งเปิด", open: false });
  problems.push(id);
  await openAs(page, student, baseURL!);
  await expect(card(page, id)).toHaveCount(0);

  await setProblemOpen(id, true);
  await expect(card(page, id).getByRole("heading", { name: "ข้อที่เพิ่งเปิด" })).toBeVisible();
  await expect(card(page, id).getByTestId("problem-status")).toHaveText("เปิดรับคำตอบ");
});

test("อาจารย์ปิดข้อ → การ์ดเปลี่ยนเป็นปิดรับทันที และกดส่งหลังปิดได้ข้อความเดียวกัน", async ({ page, baseURL }) => {
  const id = await createProblem();
  problems.push(id);
  await openAs(page, student, baseURL!);

  // เปิดหน้าต่างยืนยันค้างไว้ แล้วอาจารย์ปิดข้อ
  const c = card(page, id);
  await c.getByLabel("คำสั่ง SQL ของคุณ").fill("SELECT 1;");
  await c.getByRole("button", { name: "ส่งคำตอบ" }).click();
  const dialog = page.getByRole("dialog", { name: "ยืนยันการส่งคำตอบ" });
  await expect(dialog).toBeVisible();

  await setProblemOpen(id, false);
  await expect(c.getByTestId("problem-status")).toHaveText("ปิดรับคำตอบแล้ว");

  // กดยืนยันหลังปิด → ฐานข้อมูลปฏิเสธ
  await dialog.getByRole("button", { name: "ยืนยันส่ง" }).click();
  await expect(c.locator(`p[role="alert"]`)).toHaveText("ปิดรับคำตอบแล้ว");
  await expect(c.getByLabel("คำสั่ง SQL ของคุณ")).toBeDisabled();
  await expect(c.getByLabel("คำสั่ง SQL ของคุณ")).toHaveValue("SELECT 1;"); // SQL ที่พิมพ์ไม่หาย
});

test("ตัวนับเพิ่มบนอีกเบราว์เซอร์แบบ realtime", async ({ browser, baseURL, page }) => {
  const id = await createProblem();
  problems.push(id);
  const other = await createStudent();
  extraStudents.push(other.studentId);

  // ตรวจว่าโหมด realtime สมัครช่องตัวนับจริง
  const frames: string[] = [];
  page.on("websocket", (ws) => ws.on("framesent", (f) => frames.push(String(f.payload))));
  await openAs(page, student, baseURL!);
  expect(frames.some((f) => f.includes("realtime:problem-counts"))).toBe(true);
  await expect(card(page, id).getByTestId("submission-count")).toHaveText("0");

  const otherPage = await newStudentPage(browser, other, baseURL!);
  await fillAndConfirm(otherPage, id, "SELECT 1;");
  await expect(card(otherPage, id).getByTestId("receipt-order")).toHaveText("1");

  await expect(card(page, id).getByTestId("submission-count")).toHaveText("1");
  await submitAs(student, id);
  await expect(card(otherPage, id).getByTestId("submission-count")).toHaveText("2");
  await otherPage.context().close();
});
