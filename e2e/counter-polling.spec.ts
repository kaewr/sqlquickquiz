/**
 * NEXT_PUBLIC_COUNT_MODE=polling (รันกับ dev server ตัวที่สองในโปรเจกต์ "polling")
 * - ตัวนับอัปเดตด้วยการถามทุก 5 วินาที (ไม่ subscribe problem-counts)
 * - การเปิด/ปิดข้อยังมาแบบ realtime
 */
import { test, expect } from "@playwright/test";
import {
  createProblem,
  createStudent,
  deleteProblem,
  deleteStudentById,
  sessionCookies,
  setProblemOpen,
  submitAs,
} from "./support/supabase";

test("โหมด polling: ตัวนับเพิ่มภายในรอบถาม, ไม่สมัครช่องตัวนับ, เปิด/ปิดยังเป็น realtime", async ({ page, baseURL }) => {
  const student = await createStudent();
  const other = await createStudent();
  const id = await createProblem();
  const later = await createProblem({ title: "เปิดทีหลัง (polling)", open: false });
  try {
    const frames: string[] = [];
    page.on("websocket", (ws) => ws.on("framesent", (f) => frames.push(String(f.payload))));
    await page.context().addCookies(await sessionCookies(`${student.studentId}@quiz.local`, student.password, baseURL!));
    await page.goto("/");
    await expect(page.getByTestId("realtime-status")).toHaveAttribute("data-state", "connected");

    expect(frames.some((f) => f.includes("realtime:problem-state"))).toBe(true);
    expect(frames.some((f) => f.includes("realtime:problem-counts"))).toBe(false);

    const count = page.getByTestId(`problem-${id}`).getByTestId("submission-count");
    await expect(count).toHaveText("0");
    await submitAs(other, id);
    await expect(count).toHaveText("1", { timeout: 12_000 }); // ถามทุก 5 วินาที

    // เปิด/ปิดยังเป็น realtime
    await setProblemOpen(later, true);
    await expect(page.getByTestId(`problem-${later}`)).toBeVisible({ timeout: 4_000 });
    await setProblemOpen(id, false);
    await expect(page.getByTestId(`problem-${id}`).getByTestId("problem-status")).toHaveText("ปิดรับคำตอบแล้ว", {
      timeout: 4_000,
    });
  } finally {
    await deleteProblem(id);
    await deleteProblem(later);
    await deleteStudentById(student.studentId);
    await deleteStudentById(other.studentId);
  }
});
