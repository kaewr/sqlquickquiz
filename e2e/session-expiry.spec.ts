import { test, expect } from "@playwright/test";
import {
  INSTRUCTOR, createProblem, createStudent, deleteProblem, deleteStudentById, sessionCookies, setProblemOpen, submitAs,
} from "./support/supabase";

/**
 * หน้าเปิดค้างนานกว่าอายุ JWT แล้ว realtime ยังทำงาน (คาบเรียนมักยาวเกิน 1 ชั่วโมง)
 *
 * ช้าและต้องตั้งค่า Supabase บนเครื่องชั่วคราว จึงรันเฉพาะเมื่อสั่ง:
 *   1) supabase/config.toml [auth] jwt_expiry = 60  แล้ว db:stop + db:start
 *   2) JWT_EXPIRY_TEST=60 npx playwright test e2e/session-expiry.spec.ts --project=desktop
 *   3) คืนค่า jwt_expiry = 3600 แล้ว db:stop + db:start
 */
const EXPIRY_S = Number(process.env.JWT_EXPIRY_TEST ?? 0);
test.skip(!EXPIRY_S, "ตั้ง JWT_EXPIRY_TEST=<วินาที> พร้อม jwt_expiry เดียวกันใน config.toml");
test.setTimeout((EXPIRY_S * 3 + 120) * 1000);

test("เปิดหน้าค้างเกินอายุ JWT: นิสิตยังได้เปิด/ปิดข้อ และอาจารย์ยังเห็นการส่งแบบ realtime", async ({ browser, baseURL }) => {
  const student = await createStudent();
  const other = await createStudent();
  const id = await createProblem({ title: "หน้าค้างนาน" });
  try {
    const sctx = await browser.newContext({ baseURL });
    await sctx.addCookies(await sessionCookies(`${student.studentId}@quiz.local`, student.password, baseURL!));
    const spage = await sctx.newPage();
    await spage.goto("/");
    await expect(spage.getByTestId("realtime-status")).toHaveAttribute("data-state", "connected");

    const actx = await browser.newContext({ baseURL });
    await actx.addCookies(await sessionCookies(INSTRUCTOR.email, INSTRUCTOR.password, baseURL!));
    const apage = await actx.newPage();
    await apage.goto(`/admin/problems/${id}`);
    await expect(apage.getByTestId("realtime-status").first()).toHaveAttribute("data-state", "connected");

    // รอให้ JWT ที่ได้ตอนเปิดหน้าหมดอายุไปแล้ว 2 รอบ (ไม่รีโหลดหน้า)
    await spage.waitForTimeout(EXPIRY_S * 2.5 * 1000);

    await setProblemOpen(id, true);
    const card = spage.getByTestId(`problem-${id}`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(apage.getByTestId("detail-status").filter({ visible: true })).toHaveText("เปิดรับคำตอบ", { timeout: 10_000 });

    await submitAs(other, id);
    await expect(apage.getByTestId("detail-count").filter({ visible: true })).toHaveText("1", { timeout: 10_000 });

    // นิสิตที่เปิดหน้าค้างไว้ส่งผ่านหน้าเว็บได้ (server action ใช้ session ที่ต่ออายุแล้ว)
    await card.getByLabel("คำสั่ง SQL ของคุณ").fill("SELECT 'after expiry';");
    await card.getByRole("button", { name: "ส่งคำตอบ" }).click();
    await spage.getByRole("dialog", { name: "ยืนยันการส่งคำตอบ" }).getByRole("button", { name: "ยืนยันส่ง" }).click();
    await expect(card.getByTestId("receipt")).toBeVisible({ timeout: 10_000 });
    await expect(apage.getByTestId("detail-count").filter({ visible: true })).toHaveText("2", { timeout: 10_000 });

    await setProblemOpen(id, false);
    await expect(card).toContainText("ปิดรับคำตอบ", { timeout: 10_000 });
    await expect(apage.getByTestId("detail-status").filter({ visible: true })).toHaveText("ปิดรับคำตอบ", { timeout: 10_000 });

    await sctx.close();
    await actx.close();
  } finally {
    await deleteProblem(id);
    await deleteStudentById(student.studentId);
    await deleteStudentById(other.studentId);
  }
});
