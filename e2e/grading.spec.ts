import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  INSTRUCTOR,
  createProblem,
  createStudent,
  deleteProblem,
  deleteStudentById,
  sessionCookies,
  submitAs,
  type TestStudent,
} from "./support/supabase";

const problems: number[] = [];
const students: string[] = [];
test.afterEach(async () => {
  while (problems.length) await deleteProblem(problems.pop()!);
  while (students.length) await deleteStudentById(students.pop()!);
});

async function newStudent() {
  const s = await createStudent();
  students.push(s.studentId);
  return s;
}
async function studentPage(browser: Browser, s: TestStudent, baseURL: string) {
  const ctx = await browser.newContext({ baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok" });
  await ctx.addCookies(await sessionCookies(`${s.studentId}@quiz.local`, s.password, baseURL));
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("tab", { name: "ประวัติของฉัน" }).click();
  return page;
}
const historyStatus = (page: Page, problemId: number) => page.getByTestId(`history-${problemId}`).getByTestId("history-status");

test("ให้คะแนน → ก่อนประกาศนิสิตเห็นรอตรวจ → ประกาศผล (เตือนเมื่อยังไม่ครบ) → นิสิตเห็นผล → แก้หลังประกาศ", async ({
  page,
  browser,
  baseURL,
  context,
}) => {
  test.setTimeout(90_000); // ครบวงจร 3 เบราว์เซอร์ — นานกว่าค่าเริ่มต้น 30 วินาทีเมื่อรันพร้อมเทสต์อื่น
  const [s1, s2, s3] = [await newStudent(), await newStudent(), await newStudent()];
  const id = await createProblem({ title: "ข้อให้คะแนน" });
  problems.push(id);
  await submitAs(s1, id, "SELECT * FROM city;");
  await submitAs(s2, id, "SELECT Name FROM city;");
  await submitAs(s3, id, "SELECT 1;");

  await context.addCookies(await sessionCookies(INSTRUCTOR.email, INSTRUCTOR.password, baseURL!));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/admin/problems/${id}`);
  await expect(page.getByTestId("grading-progress")).toHaveText("ให้คะแนนแล้ว 0 / 3");

  // ปุ่มลัด "เต็ม" บันทึกทันที
  const g1 = page.getByTestId(`grade-${s1.studentId}`);
  await g1.getByRole("button", { name: "เต็ม" }).click();
  await expect(g1.getByTestId("grade-verdict")).toHaveText("ถูก 10/10");

  // กรอกเอง + ความเห็น
  const g2 = page.getByTestId(`grade-${s2.studentId}`);
  await g2.getByLabel(`คะแนน ${s2.studentId}`, { exact: true }).fill("11");
  await g2.getByRole("button", { name: "บันทึก" }).click();
  await expect(g2.getByRole("alert")).toHaveText("คะแนนเกินคะแนนเต็มของข้อนี้");
  await g2.getByLabel(`คะแนน ${s2.studentId}`, { exact: true }).fill("4");
  await page.getByLabel(`ความเห็น ${s2.studentId}`).fill("ขาดคอลัมน์ Population");
  await g2.getByRole("button", { name: "บันทึก" }).click();
  await expect(g2.getByTestId("grade-verdict")).toHaveText("ได้บางส่วน 4/10");
  await expect(page.getByTestId("grading-progress")).toHaveText("ให้คะแนนแล้ว 2 / 3");

  // ก่อนประกาศ: นิสิตเห็น "รอตรวจ" แม้ให้คะแนนแล้ว
  const p2 = await studentPage(browser, s2, baseURL!);
  await expect(historyStatus(p2, id)).toHaveText("รอตรวจ");
  await expect(p2.getByTestId(`history-${id}`).getByTestId("history-sql")).toHaveText("SELECT Name FROM city;");
  await expect(p2.getByTestId(`history-${id}`).getByTestId("history-feedback")).toHaveCount(0);

  // ประกาศผล: เตือนเพราะยังไม่ให้คะแนน 1 คน
  await page.getByRole("button", { name: "ประกาศผล" }).click();
  const warn = page.getByRole("alertdialog");
  await expect(warn).toContainText("ยังไม่ได้ให้คะแนน 1 คน");
  await warn.getByRole("button", { name: "ประกาศเลย" }).click();
  const url = page.getByTestId("ranking-url");
  await expect(url).toHaveValue(/\/r\/[A-Za-z0-9_-]{16,}$/);
  await page.getByRole("button", { name: "คัดลอกลิงก์" }).click();
  await expect(page.getByRole("button", { name: "คัดลอกแล้ว ✓" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await url.inputValue());
  await expect(page.getByRole("button", { name: "ประกาศผล" })).toHaveCount(0);

  // หลังประกาศ: นิสิตเห็นผล คะแนน และความเห็น
  await p2.reload();
  await p2.getByRole("tab", { name: "ประวัติของฉัน" }).click();
  await expect(historyStatus(p2, id)).toHaveText("ได้บางส่วน 4/10");
  await expect(p2.getByTestId(`history-${id}`).getByTestId("history-feedback")).toContainText("ขาดคอลัมน์ Population");

  // คนที่ยังไม่ได้ให้คะแนน → ยังรอตรวจ
  const p3 = await studentPage(browser, s3, baseURL!);
  await expect(historyStatus(p3, id)).toHaveText("รอตรวจ");

  // แก้หลังประกาศ → นิสิตเห็นค่าล่าสุด (โหลดใหม่เมื่อเปิดแท็บ)
  await g2.getByRole("button", { name: "เต็ม" }).click();
  await expect(g2.getByTestId("grade-verdict")).toHaveText("ถูก 10/10");
  await p2.getByRole("tab", { name: "โจทย์ปัจจุบัน" }).click();
  await p2.getByRole("tab", { name: "ประวัติของฉัน" }).click();
  await expect(historyStatus(p2, id)).toHaveText("ถูก 10/10");
  await expect(p2.getByTestId(`history-${id}`).getByTestId("history-feedback")).toContainText("ขาดคอลัมน์ Population");

  // รายการโจทย์แสดงป้ายประกาศผลแล้ว
  await page.goto("/admin/problems");
  await expect(page.getByTestId(`board-row-${id}`).getByTestId("board-released")).toHaveText("ประกาศผลแล้ว");

  await p2.context().close();
  await p3.context().close();
});

test("ปุ่มลัดครึ่ง = คะแนนเต็ม ÷ 2 และศูนย์ = ผิด; ประกาศเมื่อให้ครบไม่ต้องยืนยัน", async ({ page, baseURL, context }) => {
  const [a, b] = [await newStudent(), await newStudent()];
  const id = await createProblem();
  problems.push(id);
  const { adminClient } = await import("./support/supabase");
  await adminClient().from("problems").update({ max_score: 5 }).eq("id", id);
  await submitAs(a, id);
  await submitAs(b, id);

  await context.addCookies(await sessionCookies(INSTRUCTOR.email, INSTRUCTOR.password, baseURL!));
  await page.goto(`/admin/problems/${id}`);
  await page.getByTestId(`grade-${a.studentId}`).getByRole("button", { name: "ครึ่ง" }).click();
  await expect(page.getByTestId(`grade-${a.studentId}`).getByTestId("grade-verdict")).toHaveText("ได้บางส่วน 2.5/5");
  await page.getByTestId(`grade-${b.studentId}`).getByRole("button", { name: "ศูนย์" }).click();
  await expect(page.getByTestId(`grade-${b.studentId}`).getByTestId("grade-verdict")).toHaveText("ผิด 0/5");

  await expect(page.getByTestId("grading-progress")).toHaveText("ให้คะแนนแล้ว 2 / 2");
  await page.getByRole("button", { name: "ประกาศผล" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByTestId("released")).toBeVisible();
});

test("ปุ่มลัด 5 ระดับ (100/80/50/25/0%), แสดงทันทีและเปลี่ยนกลับเมื่อบันทึกไม่สำเร็จ, ชื่อ/ตอนเมื่อชี้ที่รหัส", async ({
  page,
  baseURL,
  context,
}) => {
  const s = await newStudent();
  const id = await createProblem();
  problems.push(id);
  await submitAs(s, id, "SELECT\n  Name,\n  Population\nFROM city;");

  await context.addCookies(await sessionCookies(INSTRUCTOR.email, INSTRUCTOR.password, baseURL!));
  await page.goto(`/admin/problems/${id}`);

  // ตารางไม่มีคอลัมน์ชื่อ/ตอนแล้ว — อยู่ในข้อความเมื่อชี้ที่รหัส
  await expect(page.getByRole("columnheader", { name: "ชื่อ - นามสกุล" })).toHaveCount(0);
  await expect(page.getByTestId(`sub-row-${s.studentId}`).getByTestId("student-id")).toHaveAttribute("title", "ทดสอบ อัตโนมัติ · ตอน 9");
  // SQL อยู่แถวล่าง คงการขึ้นบรรทัดเดิม
  await expect(page.getByTestId(`sql-row-${s.studentId}`).locator("pre")).toHaveText("SELECT\n  Name,\n  Population\nFROM city;");

  const g = page.getByTestId(`grade-${s.studentId}`);
  for (const [label, text] of [
    ["ดี", "ได้บางส่วน 8/10"],
    ["ครึ่ง", "ได้บางส่วน 5/10"],
    ["ปรับปรุง", "ได้บางส่วน 2.5/10"],
    ["ศูนย์", "ผิด 0/10"],
    ["เต็ม", "ถูก 10/10"],
  ] as const) {
    await g.getByRole("button", { name: label, exact: true }).click();
    await expect(g.getByTestId("grade-verdict")).toHaveText(text);
  }
  await expect(g.getByText("กำลังบันทึก…")).toHaveCount(0);
  const { adminClient } = await import("./support/supabase");
  const { data: saved } = await adminClient().from("results").select("score, verdict").limit(1).eq(
    "submission_id",
    (await adminClient().from("submissions").select("id").eq("problem_id", id).single()).data!.id,
  );
  expect(saved).toEqual([{ score: 10, verdict: "correct" }]);

  // บันทึกไม่สำเร็จ (เครือข่ายล่ม) → แสดงทันทีแล้วเปลี่ยนกลับเป็นค่าเดิม พร้อมข้อความ
  await page.route("**/rest/v1/results**", (route) => route.abort());
  await g.getByRole("button", { name: "ศูนย์", exact: true }).click();
  await expect(g.getByRole("alert")).toBeVisible();
  await expect(g.getByTestId("grade-verdict")).toHaveText("ถูก 10/10");
  await page.unroute("**/rest/v1/results**");
});

test("แบ่งหน้าตารางผู้ส่ง: หน้าละ 20 เป็นค่าเริ่มต้น และเลือกแสดงทั้งหมดได้", async ({ page, baseURL, context }) => {
  test.setTimeout(120_000);
  const id = await createProblem();
  problems.push(id);
  for (let i = 0; i < 25; i++) await submitAs(await newStudent(), id);

  await context.addCookies(await sessionCookies(INSTRUCTOR.email, INSTRUCTOR.password, baseURL!));
  await page.goto(`/admin/problems/${id}`);
  const rows = page.locator('tr[data-testid^="sub-row-"]');
  await expect(rows).toHaveCount(20);
  await expect(page.getByTestId("page-indicator").first()).toHaveText("หน้า 1 / 2");
  await expect(page.getByTestId("grading-progress")).toHaveText("ให้คะแนนแล้ว 0 / 25"); // นับทุกคน

  await page.getByRole("button", { name: "ถัดไป ›" }).first().click();
  await expect(rows).toHaveCount(5);
  await expect(page.getByTestId("page-indicator").first()).toHaveText("หน้า 2 / 2");

  await page.getByLabel("จำนวนต่อหน้า").selectOption({ label: "ทั้งหมด" });
  await expect(rows).toHaveCount(25);
  await expect(page.getByTestId("page-indicator")).toHaveCount(0);
});
