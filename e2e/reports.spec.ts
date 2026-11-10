import { test, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import {
  INSTRUCTOR,
  adminClient,
  createProblem,
  createStudent,
  deleteProblem,
  deleteStudentById,
  sessionCookies,
  submitAs,
  type TestStudent,
} from "./support/supabase";

const bangkokDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(Date.now() + offsetDays * 86_400_000));

/** แยก CSV แบบง่าย (รองรับ "…" และ "" ภายใน) */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n") {
      row.push(f.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      f = "";
    } else f += c;
  }
  return rows;
}

test.describe("รายงานรายคนและสำรองข้อมูล", () => {
  let section: string;
  let s: TestStudent[];
  let p1: number, p2: number, pOld: number;

  test.beforeEach(async () => {
    section = `R${Math.floor(Math.random() * 1e6)}`;
    s = [await createStudent({ section }), await createStudent({ section }), await createStudent({ section })];
    p1 = await createProblem({ title: `รายงาน ก ${section}` });
    p2 = await createProblem({ title: `รายงาน ข ${section}` });
    pOld = await createProblem({ title: `รายงาน เมื่อวาน ${section}` });
    const admin = adminClient();
    await admin.from("problem_status").update({ opened_at: `${bangkokDate(-1)}T10:00:00+07:00` }).eq("problem_id", pOld);

    // s0: p1 = 10, p2 = 4  → รวม 14, ส่ง 2 ข้อ
    // s1: p1 ส่งแต่ยังไม่ให้คะแนน, p2 = 7.5 → รวม 7.5, ส่ง 2 ข้อ
    // s2: ไม่ได้ส่งวันนี้ แต่ส่งข้อเมื่อวาน = 3
    await submitAs(s[0], p1, "SELECT report_secret_a;");
    await submitAs(s[0], p2);
    await submitAs(s[1], p1);
    await submitAs(s[1], p2);
    await submitAs(s[2], pOld);
    const { data: subs } = await admin.from("submissions").select("id, problem_id, student_user_id").in("problem_id", [p1, p2, pOld]);
    const sub = (i: number, p: number) => subs!.find((x) => x.problem_id === p && x.student_user_id === s[i].userId)!.id;
    await admin.from("results").insert([
      { submission_id: sub(0, p1), score: 10, verdict: "correct" },
      { submission_id: sub(0, p2), score: 4, verdict: "partial" },
      { submission_id: sub(1, p2), score: 7.5, verdict: "partial" },
      { submission_id: sub(2, pOld), score: 3, verdict: "partial" },
    ]);
  });

  test.afterEach(async () => {
    for (const p of [p1, p2, pOld]) await deleteProblem(p);
    for (const x of s) await deleteStudentById(x.studentId);
  });

  test("ตารางรายงาน: ช่องว่าง/รอตรวจ/คะแนนถูกตำแหน่ง ผลรวมตรง และกรองวัน/ตอนได้ — CSV ตรงกับตาราง", async ({
    page,
    baseURL,
    context,
  }) => {
    await context.addCookies(await sessionCookies(INSTRUCTOR.email, INSTRUCTOR.password, baseURL!));
    const today = bangkokDate();
    await page.goto(`/admin/reports?from=${today}&to=${today}&section=${section}`);

    await expect(page.locator('tr[data-testid^="report-row-"]')).toHaveCount(3);
    await expect(page.getByTestId(`report-col-${p1}`)).toBeVisible();
    await expect(page.getByTestId(`report-col-${pOld}`)).toHaveCount(0); // เมื่อวานไม่อยู่ในช่วง

    const cell = (i: number, p: number) => page.getByTestId(`cell-${s[i].studentId}-${p}`);
    await expect(cell(0, p1)).toHaveText("10");
    await expect(cell(0, p2)).toHaveText("4");
    await expect(cell(1, p1)).toHaveText("รอตรวจ");
    await expect(cell(1, p2)).toHaveText("7.5");
    await expect(cell(2, p1)).toHaveText("");
    await expect(cell(2, p2)).toHaveText("");

    await expect(page.getByTestId(`total-${s[0].studentId}`)).toHaveText("14");
    await expect(page.getByTestId(`total-${s[1].studentId}`)).toHaveText("7.5");
    await expect(page.getByTestId(`total-${s[2].studentId}`)).toHaveText("0");
    await expect(page.getByTestId(`submitted-${s[0].studentId}`)).toHaveText("2");
    await expect(page.getByTestId(`submitted-${s[2].studentId}`)).toHaveText("0");

    // CSV ตามตัวกรองเดียวกัน
    const href = await page.getByTestId("export-csv").getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="report-\d{8}-\d{4}-secR\d+\.csv"/);
    const bytes = await res.body();
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const rows = parseCsv(bytes.toString("utf-8").replace(/^﻿/, ""));
    const header = rows[0];
    expect(header.slice(0, 5)).toEqual(["รหัสนิสิต", "ชื่อ", "นามสกุล", "ตอน", "สถานะบัญชี"]);
    expect(header.slice(-3)).toEqual(["จำนวนข้อที่ส่ง", "คะแนนรวม", "คะแนนเต็มรวม"]);
    const col = (title: string) => header.findIndex((h) => h.includes(title));
    const r0 = rows.find((r) => r[0] === s[0].studentId)!;
    const r1 = rows.find((r) => r[0] === s[1].studentId)!;
    const r2 = rows.find((r) => r[0] === s[2].studentId)!;
    expect(r0[col(`รายงาน ก ${section}`)]).toBe("10");
    expect(r1[col(`รายงาน ก ${section}`)]).toBe("รอตรวจ");
    expect(r2[col(`รายงาน ก ${section}`)]).toBe("");
    expect([r0.at(-3), r0.at(-2)]).toEqual(["2", "14"]);
    expect([r1.at(-3), r1.at(-2)]).toEqual(["2", "7.5"]);
    expect([r2.at(-3), r2.at(-2)]).toEqual(["0", "0"]);
    expect(rows.filter((r) => r[3] === section)).toHaveLength(3);
    expect(col(`รายงาน เมื่อวาน ${section}`)).toBe(-1);

    // กรองเป็นเมื่อวาน
    await page.goto(`/admin/reports?from=${bangkokDate(-1)}&to=${bangkokDate(-1)}&section=${section}`);
    await expect(page.getByTestId(`report-col-${pOld}`)).toBeVisible();
    await expect(page.getByTestId(`report-col-${p1}`)).toHaveCount(0);
    await expect(page.getByTestId(`cell-${s[2].studentId}-${pOld}`)).toHaveText("3");
    await expect(page.getByTestId(`total-${s[2].studentId}`)).toHaveText("3");
  });

  test("สำรองข้อมูล: zip มี CSV ครบ 8 ตาราง + README, มี BOM และข้อมูลจริง", async ({ page, baseURL, context }) => {
    await context.addCookies(await sessionCookies(INSTRUCTOR.email, INSTRUCTOR.password, baseURL!));
    await page.goto("/admin/reports");
    const res = await page.request.get((await page.getByTestId("backup").getAttribute("href"))!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/zip");
    expect(res.headers()["content-disposition"]).toMatch(/sql-quick-quiz-backup-\d{8}-\d{4}\.zip/);

    const files = unzipSync(new Uint8Array(await res.body()));
    const names = Object.keys(files).sort();
    expect(names).toEqual(
      [
        "README.txt",
        "grading_jobs.csv",
        "instructors.csv",
        "problem_solutions.csv",
        "problem_status.csv",
        "problems.csv",
        "profiles.csv",
        "results.csv",
        "submissions.csv",
      ].sort(),
    );
    for (const n of names.filter((x) => x.endsWith(".csv"))) {
      expect([...files[n].subarray(0, 3)], n).toEqual([0xef, 0xbb, 0xbf]);
    }
    const submissions = strFromU8(files["submissions.csv"]);
    expect(submissions).toContain("SELECT report_secret_a;");
    // strFromU8 ตัด BOM ออกเอง (ตรวจ BOM ที่ระดับไบต์ข้างบนแล้ว)
    expect(submissions.split("\r\n")[0]).toBe("id,problem_id,student_user_id,sql_text,submitted_at,submit_order");
    expect(strFromU8(files["profiles.csv"])).toContain(s[0].studentId);
    expect(strFromU8(files["problem_solutions.csv"])).toContain("SELECT SECRET_SOLUTION;");
    expect(strFromU8(files["README.txt"])).toMatch(/submissions\.csv\t\d+ แถว/);
  });

  test("นิสิตและผู้ไม่ล็อกอินเรียก API รายงาน/สำรองข้อมูลไม่ได้", async ({ page, baseURL, playwright }) => {
    await page.context().addCookies(await sessionCookies(`${s[0].studentId}@quiz.local`, s[0].password, baseURL!));
    expect((await page.request.get("/api/admin/reports/csv")).status()).toBe(403);
    expect((await page.request.get("/api/admin/backup")).status()).toBe(403);
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "ไม่มีสิทธิ์เข้าถึง" })).toBeVisible();

    const anon = await playwright.request.newContext({ baseURL });
    expect((await anon.get("/api/admin/reports/csv")).status()).toBe(401);
    expect((await anon.get("/api/admin/backup")).status()).toBe(401);
    await anon.dispose();
  });
});
