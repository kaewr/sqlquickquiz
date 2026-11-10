import { test, expect, type Page } from "@playwright/test";
import {
  INSTRUCTOR,
  adminClient,
  createProblem,
  createStudent,
  deleteProblem,
  deleteStudentById,
  sessionCookies,
  setProblemOpen,
  submitAs,
  type TestStudent,
} from "./support/supabase";

const problems: number[] = [];
const students: string[] = [];
test.afterEach(async () => {
  while (problems.length) await deleteProblem(problems.pop()!);
  while (students.length) await deleteStudentById(students.pop()!);
});

async function asInstructor(page: Page, baseURL: string) {
  await page.context().addCookies(await sessionCookies(INSTRUCTOR.email, INSTRUCTOR.password, baseURL));
}
async function newStudent(opts: Parameters<typeof createStudent>[0] = {}) {
  const s = await createStudent(opts);
  students.push(s.studentId);
  return s;
}
async function newProblem(opts: Parameters<typeof createProblem>[0] = {}) {
  const id = await createProblem(opts);
  problems.push(id);
  return id;
}
const connected = (page: Page) => expect(page.getByTestId("realtime-status").first()).toHaveAttribute("data-state", "connected");
const bangkokDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(Date.now() + offsetDays * 86_400_000));

test("ครบวง: อาจารย์สร้างโจทย์ → เปิด → นิสิตส่ง → อาจารย์เห็นทันที → ปิด → นิสิตเห็นปิด", async ({ page, browser, baseURL }) => {
  const student = await newStudent({ section: "7" });
  await asInstructor(page, baseURL!);

  // สร้างโจทย์พร้อมดูตัวอย่าง markdown
  await page.goto("/admin/problems/new");
  await page.getByLabel("ชื่อโจทย์", { exact: true }).fill("E2E นับเมือง");
  await page.getByLabel("คำอธิบาย (markdown)", { exact: true }).fill("นับจำนวน **เมือง** ทั้งหมด");
  await page.getByLabel("ตัวอย่างผลลัพธ์ (markdown — ตารางใช้ | คอลัมน์ |)", { exact: true }).fill("| cnt |\n| --- |\n| 4079 |");
  await page.getByRole("group", { name: /มุมมอง ตัวอย่างผลลัพธ์/ }).getByRole("button", { name: "ตัวอย่าง" }).click();
  await expect(page.getByTestId("preview-expected_example").getByRole("table")).toContainText("4079");
  await page.getByLabel("คะแนนเต็ม").fill("5");
  await page.getByLabel(/dataset_name/).fill("world");
  await page.getByLabel(/ลำดับแถวต้องตรง/).check();
  await page.getByLabel("คำสั่งเฉลย (นิสิตไม่เห็น)").fill("SELECT COUNT(*) AS cnt FROM city;");
  await page.getByRole("button", { name: "บันทึกโจทย์" }).click();

  await expect(page).toHaveURL(/\/admin\/problems\/\d+$/);
  const problemId = Number(page.url().split("/").pop());
  problems.push(problemId);
  await expect(page.getByRole("heading", { name: "E2E นับเมือง" })).toBeVisible();
  await expect(page.getByTestId("detail-status").filter({ visible: true })).toHaveText("ปิดรับคำตอบ");
  await expect(page.getByText("คะแนนเต็ม 5 · ลำดับแถวต้องตรง · dataset: world")).toBeVisible();
  await connected(page);

  // นิสิตเปิดหน้าไว้ (ยังไม่เห็นโจทย์)
  const sctx = await browser.newContext({ baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok" });
  const spage = await sctx.newPage();
  await sctx.addCookies(await sessionCookies(`${student.studentId}@quiz.local`, student.password, baseURL!));
  await spage.goto("/");
  await connected(spage);
  await expect(spage.getByTestId(`problem-${problemId}`)).toHaveCount(0);

  // อาจารย์เปิด → นิสิตเห็นทันที
  await page.getByRole("button", { name: "เปิดรับคำตอบ" }).click();
  await expect(page.getByTestId("detail-status").filter({ visible: true })).toHaveText("เปิดรับคำตอบ");
  const scard = spage.getByTestId(`problem-${problemId}`);
  await expect(scard.getByRole("heading", { name: "E2E นับเมือง" })).toBeVisible();
  await expect(scard).not.toContainText("SELECT COUNT(*) AS cnt FROM city;"); // ไม่เห็นเฉลย

  // นิสิตส่ง → อาจารย์เห็นแถวใหม่พร้อม SQL และคนนั้นหายจาก "ยังไม่ส่ง"
  await expect(page.getByTestId(`pending-${student.studentId}`)).toBeVisible();
  await scard.getByLabel("คำสั่ง SQL ของคุณ").fill("SELECT count(*) FROM city;");
  await scard.getByRole("button", { name: "ส่งคำตอบ" }).click();
  await spage.getByRole("dialog").getByRole("button", { name: "ยืนยันส่ง" }).click();
  await expect(scard.getByTestId("receipt")).toBeVisible();

  const row = page.getByTestId(`sub-row-${student.studentId}`);
  await expect(page.getByTestId(`sql-row-${student.studentId}`)).toContainText("SELECT count(*) FROM city;");
  await expect(row.getByTestId("student-id")).toHaveAttribute("title", "ทดสอบ อัตโนมัติ · ตอน 7");
  await expect(page.getByTestId(`pending-${student.studentId}`)).toHaveCount(0);
  await expect(page.getByTestId("detail-count").filter({ visible: true })).toHaveText("1");

  // อาจารย์ปิด → นิสิตเห็นปิดทันที
  await page.getByRole("button", { name: "ปิดรับคำตอบ" }).click();
  await expect(page.getByTestId("detail-status").filter({ visible: true })).toHaveText("ปิดรับคำตอบ");
  await expect(scard.getByTestId("problem-status")).toHaveText("ปิดรับคำตอบแล้ว");
  await sctx.close();
});

test("ฟอร์มแจ้งช่องที่ผิด และเตือนเมื่อยังไม่มีเฉลย", async ({ page, baseURL }) => {
  await asInstructor(page, baseURL!);
  await page.goto("/admin/problems/new");
  await expect(page.getByTestId("reference-sql-warning")).toBeVisible();
  await page.getByLabel("คะแนนเต็ม").fill("0");
  await page.getByRole("button", { name: "บันทึกโจทย์" }).click();
  await expect(page.getByText("กรุณาใส่ชื่อโจทย์")).toBeVisible();
  await expect(page.getByText(/คะแนนเต็มต้องเป็นตัวเลขมากกว่า 0/)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/problems\/new$/);
});

test("แก้ไขโจทย์ที่มีคนส่งแล้ว: มีคำเตือน แก้ได้ แต่คะแนนเต็มต่ำกว่าคะแนนที่ให้แล้วไม่ได้", async ({ page, baseURL }) => {
  const student = await newStudent();
  const id = await newProblem({ title: "ก่อนแก้" });
  await submitAs(student, id);
  const admin = adminClient();
  const { data: sub } = await admin.from("submissions").select("id").eq("problem_id", id).single();
  await admin.from("results").insert({ submission_id: sub!.id, score: 8, verdict: "partial" });

  await asInstructor(page, baseURL!);
  await page.goto(`/admin/problems/${id}/edit`);
  await expect(page.getByRole("status")).toContainText("มีคนส่งแล้ว 1 คน");

  await page.getByLabel("คะแนนเต็ม").fill("5");
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(page.getByText("คะแนนเต็มต่ำกว่าคะแนนที่ให้นิสิตไปแล้ว")).toBeVisible();

  await page.getByLabel("ชื่อโจทย์", { exact: true }).fill("หลังแก้");
  await page.getByLabel("คะแนนเต็ม").fill("10");
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/problems/${id}$`));
  await expect(page.getByRole("heading", { name: "หลังแก้" })).toBeVisible();
});

test("คัดลอกโจทย์: ได้โจทย์ใหม่ที่ยังไม่เปิด พร้อมเฉลย", async ({ page, baseURL }) => {
  const id = await newProblem({ title: "ต้นฉบับ", open: true });
  await asInstructor(page, baseURL!);
  await page.goto(`/admin/problems/${id}`);
  await page.getByRole("link", { name: "คัดลอก" }).click();

  await expect(page.getByRole("heading", { name: "คัดลอกโจทย์" })).toBeVisible();
  await expect(page.getByLabel("ชื่อโจทย์", { exact: true })).toHaveValue("ต้นฉบับ (สำเนา)");
  await expect(page.getByLabel("คำสั่งเฉลย (นิสิตไม่เห็น)")).toHaveValue("SELECT SECRET_SOLUTION;");
  await page.getByRole("button", { name: "บันทึกโจทย์" }).click();

  await expect(page).toHaveURL(/\/admin\/problems\/\d+$/);
  const copyId = Number(page.url().split("/").pop());
  problems.push(copyId);
  expect(copyId).not.toBe(id);
  await expect(page.getByTestId("detail-status").filter({ visible: true })).toHaveText("ปิดรับคำตอบ");
  await expect(page.getByText("ยังไม่เคยเปิด")).toBeVisible();
});

test("มุมมองรายวัน: แบ่งวันตามเวลากรุงเทพ, ร่างแยกไว้, เปิดหลายข้อพร้อมกัน, ตัวนับอัปเดตเอง", async ({ page, baseURL }) => {
  const student = await newStudent();
  const today1 = await newProblem({ title: "วันนี้ ก", open: true });
  const draft = await newProblem({ title: "ร่าง ข", open: false });
  const old = await newProblem({ title: "เมื่อวาน ค", open: true });
  // ย้ายวันเปิดครั้งแรกเป็นเมื่อวาน 23:30 เวลากรุงเทพ
  await adminClient()
    .from("problem_status")
    .update({ opened_at: `${bangkokDate(-1)}T23:30:00+07:00` })
    .eq("problem_id", old);

  await asInstructor(page, baseURL!);
  await page.goto("/admin/problems");
  await expect(page.getByTestId("day-label")).toContainText("(วันนี้)");
  await expect(page.getByTestId(`board-row-${today1}`)).toBeVisible();
  await expect(page.getByTestId(`board-row-${old}`)).toHaveCount(0);
  await expect(page.getByRole("region", { name: /ยังไม่เคยเปิด/ }).getByTestId(`board-row-${draft}`)).toBeVisible();

  // เปิดร่างอีกข้อ → ย้ายมาอยู่วันนี้ และเปิดพร้อมกัน 2 ข้อ
  await connected(page);
  await page.getByTestId(`board-row-${draft}`).getByRole("button", { name: "เปิดรับคำตอบ" }).click();
  await expect(page.getByRole("region", { name: /เปิดในวันที่เลือก/ }).getByTestId(`board-row-${draft}`)).toBeVisible();
  await expect(page.getByTestId(`board-row-${draft}`).getByTestId("board-status")).toHaveText("เปิดรับ");
  await expect(page.getByTestId(`board-row-${today1}`).getByTestId("board-status")).toHaveText("เปิดรับ");

  // ตัวนับอัปเดตเอง
  await connected(page);
  await submitAs(student, today1);
  await expect(page.getByTestId(`board-row-${today1}`).getByTestId("board-count")).toHaveText("1");

  // เมื่อวาน
  await page.goto(`/admin/problems?date=${bangkokDate(-1)}`);
  await expect(page.getByTestId(`board-row-${old}`)).toBeVisible();
  await expect(page.getByTestId(`board-row-${today1}`)).toHaveCount(0);
});

test("หน้ารายละเอียด: กรองตามตอนเรียน ทั้งผู้ส่งและคนที่ยังไม่ส่ง", async ({ page, baseURL }) => {
  const a = await newStudent({ section: "71" });
  const b = await newStudent({ section: "72" });
  const c = await newStudent({ section: "72" });
  const id = await newProblem({ open: true });
  await submitAs(a, id, "SELECT 'a';");
  await submitAs(b, id, "SELECT 'b';");

  await asInstructor(page, baseURL!);
  await page.goto(`/admin/problems/${id}`);
  await page.getByLabel("กรองตามตอนเรียน").selectOption("72");
  await expect(page.getByTestId(`sub-row-${b.studentId}`)).toBeVisible();
  await expect(page.getByTestId(`sub-row-${a.studentId}`)).toHaveCount(0);
  await expect(page.getByTestId(`pending-${c.studentId}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: /ยังไม่ส่ง \(1 จาก 2 คน\)/ })).toBeVisible();

  await page.getByLabel("กรองตามตอนเรียน").selectOption("71");
  await expect(page.getByTestId(`sub-row-${a.studentId}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: /ยังไม่ส่ง \(0 จาก 1 คน\)/ })).toBeVisible();
});

test("นิสิตเข้าหน้าโจทย์ของอาจารย์ไม่ได้", async ({ page, baseURL }) => {
  const s: TestStudent = await newStudent();
  const id = await newProblem();
  await page.context().addCookies(await sessionCookies(`${s.studentId}@quiz.local`, s.password, baseURL!));
  for (const path of ["/admin/problems", `/admin/problems/${id}`, `/admin/problems/${id}/edit`, "/admin/problems/new"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึง" })).toBeVisible();
  }
  await expect(page.getByText("SECRET_SOLUTION")).toHaveCount(0);
  await setProblemOpen(id, false);
});

test("ลบโจทย์ที่มีคนส่งแล้ว: แจ้งผลกระทบ, ต้องพิมพ์ชื่อตรง, นิสิตเห็นปิดทันที, ข้อมูลหายหมด", async ({ page, browser, baseURL }) => {
  const done = await newStudent();
  const watcher = await newStudent();
  const id = await newProblem({ title: "ข้อทดลองที่จะลบ", open: true });
  await submitAs(done, id);
  const admin = adminClient();
  const { data: sub } = await admin.from("submissions").select("id").eq("problem_id", id).single();
  await admin.from("results").insert({ submission_id: sub!.id, score: 10, verdict: "correct" });

  // นิสิตอีกคนเปิดหน้าโจทย์ค้างไว้
  const sctx = await browser.newContext({ baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok" });
  await sctx.addCookies(await sessionCookies(`${watcher.studentId}@quiz.local`, watcher.password, baseURL!));
  const spage = await sctx.newPage();
  await spage.goto("/");
  await connected(spage);
  await expect(spage.getByTestId(`problem-${id}`).getByTestId("problem-status")).toHaveText("เปิดรับคำตอบ");

  await asInstructor(page, baseURL!);
  await page.goto(`/admin/problems/${id}`);
  await page.getByRole("button", { name: "ลบโจทย์นี้…" }).click();
  const dialog = page.getByRole("dialog", { name: "⚠️ ลบโจทย์ถาวร" });
  await expect(dialog.getByTestId("impact-submissions")).toHaveText("1");
  await expect(dialog.getByTestId("impact-results")).toHaveText("1");
  await expect(dialog.getByTestId("delete-impact")).toContainText("นิสิตที่กำลังทำจะเห็นว่าปิดรับคำตอบทันที");

  const confirmBtn = dialog.getByRole("button", { name: "ลบถาวร" });
  await dialog.getByLabel("พิมพ์ชื่อโจทย์เพื่อยืนยัน").fill("ข้อทดลองที่จะ");
  await expect(confirmBtn).toBeDisabled();
  await dialog.getByLabel("พิมพ์ชื่อโจทย์เพื่อยืนยัน").fill("ข้อทดลองที่จะลบ");
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  await expect(page).toHaveURL(/\/admin\/problems\?deleted=/);
  await expect(page.getByTestId("deleted-notice")).toHaveText("ลบโจทย์ “ข้อทดลองที่จะลบ” แล้ว");
  await expect(page.getByTestId(`board-row-${id}`)).toHaveCount(0);

  // นิสิตที่เปิดหน้าอยู่เห็นปิดทันที
  await expect(spage.getByTestId(`problem-${id}`).getByTestId("problem-status")).toHaveText("ปิดรับคำตอบแล้ว");
  await sctx.close();

  // ข้อมูลหายหมด
  const [{ count: p }, { count: s }, { count: r }] = await Promise.all([
    admin.from("problems").select("id", { count: "exact", head: true }).eq("id", id),
    admin.from("submissions").select("id", { count: "exact", head: true }).eq("problem_id", id),
    admin.from("results").select("id", { count: "exact", head: true }).eq("submission_id", sub!.id),
  ]);
  expect([p, s, r]).toEqual([0, 0, 0]);
});

test("ลบโจทย์ร่างที่ยังไม่มีคนส่ง", async ({ page, baseURL }) => {
  const id = await newProblem({ title: "ร่างที่จะลบ", open: false });
  await asInstructor(page, baseURL!);
  await page.goto(`/admin/problems/${id}`);
  await page.getByRole("button", { name: "ลบโจทย์นี้…" }).click();
  const dialog = page.getByRole("dialog", { name: "⚠️ ลบโจทย์ถาวร" });
  await expect(dialog.getByTestId("impact-submissions")).toHaveText("0");
  await expect(dialog.getByTestId("delete-impact")).not.toContainText("เปิดรับคำตอบอยู่");
  await dialog.getByLabel("พิมพ์ชื่อโจทย์เพื่อยืนยัน").fill("ร่างที่จะลบ");
  await dialog.getByRole("button", { name: "ลบถาวร" }).click();
  await expect(page.getByTestId("deleted-notice")).toBeVisible();
});
