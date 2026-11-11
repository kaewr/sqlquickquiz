import { test, expect } from "@playwright/test";
import { adminClient, createProblem, createStudent, deleteProblem, deleteStudentById, submitAs } from "./support/supabase";

test("หน้าอันดับสาธารณะ: ไม่ต้องล็อกอิน, เรียงตามคะแนน/สลับเป็นลำดับส่งได้, รหัสปิดบางส่วน, ไม่มี SQL/ชื่อใน HTML, token ผิด = 404", async ({
  page,
  request,
}) => {
  const students = [await createStudent(), await createStudent(), await createStudent()];
  const id = await createProblem({ title: "อันดับทดสอบ" });
  const token = `e2e${Math.random().toString(36).slice(2)}${Date.now()}`.slice(0, 24);
  try {
    for (const [i, s] of students.entries()) await submitAs(s, id, `SELECT secret_sql_${i} FROM city;`);
    const admin = adminClient();
    const { data: subs } = await admin.from("submissions").select("id, student_user_id").eq("problem_id", id);
    const subOf = (i: number) => subs!.find((x) => x.student_user_id === students[i].userId)!.id;
    // คนที่ 2 และ 3 คะแนนเท่ากัน → คนที่ 2 ส่งก่อนได้อันดับดีกว่า
    await admin.from("results").insert([
      { submission_id: subOf(0), score: 5, verdict: "partial" },
      { submission_id: subOf(1), score: 10, verdict: "correct" },
      { submission_id: subOf(2), score: 10, verdict: "correct" },
    ]);
    await admin.from("problem_status").update({ is_open: false }).eq("problem_id", id);
    await admin.from("problems").update({ results_released_at: new Date().toISOString(), public_token: token }).eq("id", id);

    // หน้าเว็บ (ไม่ได้ล็อกอิน)
    const res = await page.goto(`/r/${token}`);
    expect(res!.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "อันดับทดสอบ" })).toBeVisible();
    await expect(page.getByText("ผู้ส่ง 3 คน")).toBeVisible();
    const rows = page.getByTestId("ranking-row");
    await expect(rows).toHaveCount(3);
    const mask = (sid: string) => `${sid.slice(0, 2)}xxx${sid.slice(-3)}`;
    // [อันดับ, ลำดับส่ง, นิสิตคนที่, คะแนน]
    const expectRows = async (expected: [string, string, number, string][]) => {
      for (const [i, [rank, order, who, score]] of expected.entries()) {
        const cells = rows.nth(i).locator("td");
        await expect(cells.nth(0)).toHaveText(rank);
        await expect(cells.nth(1)).toHaveText(order);
        await expect(cells.nth(2)).toHaveText(mask(students[who].studentId));
        await expect(cells.nth(4)).toHaveText(score);
      }
    };
    // ค่าเริ่มต้น: เรียงตามคะแนน
    await expect(page.getByTestId("sort-score")).toHaveAttribute("aria-pressed", "true");
    await expectRows([
      ["1", "2", 1, "10"],
      ["2", "3", 2, "10"],
      ["3", "1", 0, "5"],
    ]);
    // สลับเป็นลำดับส่ง แล้วกลับ
    await page.getByTestId("sort-order").click();
    await expect(page.getByTestId("sort-order")).toHaveAttribute("aria-pressed", "true");
    await expectRows([
      ["3", "1", 0, "5"],
      ["1", "2", 1, "10"],
      ["2", "3", 2, "10"],
    ]);
    await page.getByTestId("sort-score").click();
    await expect(rows.nth(0).locator("td").nth(0)).toHaveText("1");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // HTML + ข้อมูลที่ฝังมา (RSC payload) ทั้งหมด ไม่มี SQL / ชื่อ / รหัสเต็ม
    const html = await (await request.get(`/r/${token}`)).text();
    expect(html).toContain("อันดับทดสอบ");
    expect(html).not.toContain("secret_sql");
    expect(html).not.toContain("SELECT");
    expect(html).not.toContain("ทดสอบ อัตโนมัติ");
    expect(html).not.toContain("อัตโนมัติ");
    for (const s of students) expect(html).not.toContain(s.studentId);

    // token ผิด / รูปแบบผิด → 404
    for (const bad of ["no-such-token-abcdefgh1234", "x", `${token}x`, "%E0%A4%A"]) {
      const r = await request.get(`/r/${bad}`);
      expect(r.status(), bad).toBe(404);
    }
    await page.goto("/r/no-such-token-abcdefgh1234");
    await expect(page.getByRole("heading", { name: "ไม่พบหน้าอันดับนี้" })).toBeVisible();
  } finally {
    await deleteProblem(id);
    for (const s of students) await deleteStudentById(s.studentId);
  }
});

test("ข้อที่ยังไม่ประกาศผลเปิดหน้าอันดับไม่ได้", async ({ request }) => {
  const s = await createStudent();
  const id = await createProblem();
  try {
    await submitAs(s, id);
    // มี token แต่ไม่มีเวลาประกาศ — ตั้งไม่ได้เพราะ constraint บังคับคู่กัน จึงใช้ token ที่ไม่มีอยู่แทน
    const r = await request.get(`/r/unreleased${id}abcdefghijklmnop`);
    expect(r.status()).toBe(404);
  } finally {
    await deleteProblem(id);
    await deleteStudentById(s.studentId);
  }
});
