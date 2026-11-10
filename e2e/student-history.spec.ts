import { test, expect } from "@playwright/test";
import {
  adminClient,
  createProblem,
  createStudent,
  deleteProblem,
  deleteStudentById,
  sessionCookies,
  submitAs,
} from "./support/supabase";

test("ประวัติของฉัน: เรียงล่าสุดก่อน, รอตรวจ/ผล, เห็นเฉพาะของตัวเอง, ใช้บนมือถือได้", async ({ page, baseURL }) => {
  const me = await createStudent();
  const other = await createStudent();
  const older = await createProblem({ title: "ข้อเก่า (ประกาศแล้ว)" });
  const newer = await createProblem({ title: "ข้อใหม่ (ยังไม่ประกาศ)" });
  const notMine = await createProblem({ title: "ข้อที่ไม่ได้ส่ง" });
  try {
    await submitAs(me, older, "SELECT older;");
    await submitAs(me, newer, "SELECT newer;");
    await submitAs(other, older, "SELECT other_student_secret;");
    await submitAs(other, notMine, "SELECT other_only;");

    // ให้คะแนนทุกคน แล้วประกาศเฉพาะข้อเก่า
    const admin = adminClient();
    const { data: subs } = await admin.from("submissions").select("id, problem_id").in("problem_id", [older, newer, notMine]);
    for (const s of subs ?? []) {
      await admin.from("results").insert({ submission_id: s.id, score: s.problem_id === older ? 10 : 3, verdict: "partial", feedback: "ดีมาก" });
    }
    await admin
      .from("problems")
      .update({ results_released_at: new Date().toISOString(), public_token: `tok-${older}-${Date.now()}-abcdefgh` })
      .eq("id", older);

    await page.context().addCookies(await sessionCookies(`${me.studentId}@quiz.local`, me.password, baseURL!));
    await page.goto("/");
    await page.getByRole("tab", { name: "ประวัติของฉัน" }).click();

    const items = page.getByTestId("history-list").locator("> li");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute("data-testid", `history-${newer}`); // ล่าสุดก่อน
    await expect(items.nth(1)).toHaveAttribute("data-testid", `history-${older}`);

    await expect(page.getByTestId(`history-${newer}`).getByTestId("history-status")).toHaveText("รอตรวจ");
    await expect(page.getByTestId(`history-${newer}`).getByTestId("history-feedback")).toHaveCount(0);
    await expect(page.getByTestId(`history-${older}`).getByTestId("history-status")).toHaveText("ถูก 10/10");
    await expect(page.getByTestId(`history-${older}`).getByTestId("history-sql")).toHaveText("SELECT older;");

    // ไม่เห็นของคนอื่น
    await expect(page.getByText("other_student_secret")).toHaveCount(0);
    await expect(page.getByTestId(`history-${notMine}`)).toHaveCount(0);

    // ดูโจทย์ได้
    await page.getByTestId(`history-${older}`).getByText("ดูโจทย์").click();
    await expect(page.getByTestId(`history-${older}`).getByRole("table")).toContainText("Bangkok");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  } finally {
    for (const p of [older, newer, notMine]) await deleteProblem(p);
    await deleteStudentById(me.studentId);
    await deleteStudentById(other.studentId);
  }
});
