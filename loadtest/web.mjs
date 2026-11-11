// Load test ผ่านหน้าเว็บจริง (Playwright): นิสิต N คนล็อกอินผ่านฟอร์ม → รอโจทย์ → ส่งผ่าน server action
// วัดเวลาที่นิสิตรอจริง ตั้งแต่กด "ยืนยันส่ง" จนเห็นใบยืนยัน รวม Vercel + Supabase
//
//   node loadtest/web.mjs [--students 40] [--window 30] [--login-rate 5]
//                         [--target local|prod --yes-production] [--base-url URL] [--headed]
// local ใช้ http://localhost:3000 (ต้องรัน npm run dev ไว้), prod ใช้ https://sqlquickquiz.vercel.app
// ต้องสร้างบัญชีก่อน: node loadtest/accounts.mjs create --count N

import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  ROOT, parseArgs, loadTarget, adminClient, fail, sleep, percentile, studentId, TITLE_PREFIX, deleteLoadtestProblems,
} from "./lib.mjs";

const args = parseArgs();
const N = Number(args.students ?? 40);
const WINDOW_S = Number(args.window ?? 30);
const LOGIN_RATE = Number(args["login-rate"] ?? 5);
if (!Number.isInteger(N) || N < 1 || N > 60) fail("--students ต้องอยู่ระหว่าง 1–60 (เบราว์เซอร์บนเครื่องเดียว)");
if (!(WINDOW_S > 0 && WINDOW_S <= 300)) fail("--window ต้องอยู่ระหว่าง 1–300 วินาที");

const t = loadTarget(args);
const BASE = args["base-url"] ?? (t.target === "prod" ? "https://sqlquickquiz.vercel.app" : "http://localhost:3000");
const admin = adminClient(t);
const T_START = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T_START) / 1000).toFixed(1).padStart(6)}s]`, ...a);
console.log(`เป้าหมาย: ${t.target} · เว็บ ${BASE} · นิสิต ${N} · ล็อกอิน ${LOGIN_RATE} คน/วินาที · ส่งภายใน ${WINDOW_S}s`);

const browser = await chromium.launch({ headless: !args.headed });
const students = Array.from({ length: N }, (_, i) => ({ id: studentId(i + 1) }));
let PID = null;
let exitCode = 0;

try {
  // ---------- ล็อกอินผ่านฟอร์ม ----------
  const t0 = Date.now();
  await Promise.all(students.map(async (s, i) => {
    await sleep((i / LOGIN_RATE) * 1000);
    s.context = await browser.newContext({ baseURL: BASE, locale: "th-TH", timezoneId: "Asia/Bangkok" });
    s.page = await s.context.newPage();
    try {
      await s.page.goto("/");
      await s.page.getByLabel("รหัสนิสิต").fill(s.id);
      await s.page.getByLabel("รหัสผ่าน").fill(s.id);
      const start = Date.now();
      await s.page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
      await s.page.getByTestId("realtime-status").waitFor({ timeout: 60_000 });
      s.loginMs = Date.now() - start;
      s.sawQueue = await s.page.getByTestId("login-queue").count() > 0;
      await s.page.locator('[data-testid="realtime-status"][data-state="connected"]').waitFor({ timeout: 30_000 });
    } catch (e) {
      s.loginError = String(e?.message ?? e).split("\n")[0];
    }
  }));
  const loggedIn = students.filter((s) => s.loginMs != null && !s.loginError);
  log(`ล็อกอินผ่านเว็บ ${loggedIn.length}/${N} (${((Date.now() - t0) / 1000).toFixed(1)}s) p50 ${percentile(loggedIn.map((s) => s.loginMs), 50)}ms p95 ${percentile(loggedIn.map((s) => s.loginMs), 95)}ms`);
  if (loggedIn.length < N) log(`  ⚠ ${students.filter((s) => s.loginError).slice(0, 3).map((s) => `${s.id}: ${s.loginError}`).join(" | ")}`);

  // ---------- เปิดโจทย์ ----------
  const { data: problem, error: pErr } = await admin
    .from("problems")
    .insert({ title: `${TITLE_PREFIX} web ${new Date().toISOString()} n=${N}`, description: "โจทย์ทดสอบภาระผ่านเว็บ — ลบอัตโนมัติ", max_score: 10 })
    .select("id")
    .single();
  if (pErr) throw new Error(`สร้างโจทย์ไม่ได้: ${pErr.message}`);
  PID = problem.id;
  const tOpen = Date.now();
  await admin.from("problem_status").update({ is_open: true }).eq("problem_id", PID);
  log(`เปิดโจทย์ id=${PID}`);

  // ---------- ส่งคำตอบผ่านหน้าเว็บ ----------
  await Promise.all(loggedIn.map(async (s) => {
    const card = s.page.getByTestId(`problem-${PID}`);
    try {
      await card.waitFor({ timeout: 30_000 });
      s.seenOpenMs = Date.now() - tOpen;
      await sleep(Math.random() * WINDOW_S * 1000);
      await card.getByLabel("คำสั่ง SQL ของคุณ").fill(`SELECT '${s.id}'; -- web loadtest`);
      await card.getByRole("button", { name: "ส่งคำตอบ" }).click();
      const start = Date.now();
      await s.page.getByRole("dialog", { name: "ยืนยันการส่งคำตอบ" }).getByRole("button", { name: "ยืนยันส่ง" }).click();
      await card.getByTestId("receipt").waitFor({ timeout: 30_000 });
      s.submitMs = Date.now() - start;
    } catch (e) {
      s.submitError = String(e?.message ?? e).split("\n")[0];
    }
  }));
  await sleep(2000);

  // ---------- ปิดโจทย์ ----------
  const tClose = Date.now();
  await admin.from("problem_status").update({ is_open: false }).eq("problem_id", PID);
  await Promise.all(loggedIn.map(async (s) => {
    try {
      await s.page.getByTestId(`problem-${PID}`).getByText("ปิดรับคำตอบแล้ว").first().waitFor({ timeout: 15_000 });
      s.seenCloseMs = Date.now() - tClose;
    } catch {
      /* ไม่เห็นปิด */
    }
  }));
  log("ปิดโจทย์แล้ว");

  // ---------- ตรวจผล ----------
  const { count } = await admin.from("submissions").select("id", { count: "exact", head: true }).eq("problem_id", PID);
  const okSubmit = loggedIn.filter((s) => s.submitMs != null);
  const sub = okSubmit.map((s) => s.submitMs);
  const checks = [
    ["ล็อกอินผ่านเว็บครบ", loggedIn.length === N, `${loggedIn.length}/${N}`],
    ["ส่งผ่านเว็บเห็นใบยืนยันครบ", okSubmit.length === loggedIn.length, `${okSubmit.length}/${loggedIn.length}`],
    ["submissions ในฐานข้อมูล", count === okSubmit.length, `${count}`],
    ["เห็นโจทย์เปิดเอง (ไม่รีโหลด)", loggedIn.every((s) => s.seenOpenMs != null), `${loggedIn.filter((s) => s.seenOpenMs != null).length}/${loggedIn.length}`],
    ["เห็นปิดรับคำตอบเอง", loggedIn.every((s) => s.seenCloseMs != null), `${loggedIn.filter((s) => s.seenCloseMs != null).length}/${loggedIn.length}`],
  ];
  const summary = {
    when: new Date().toISOString(), target: t.target, base: BASE, students: N, windowS: WINDOW_S, loginRate: LOGIN_RATE,
    loginMs: { p50: percentile(loggedIn.map((s) => s.loginMs), 50), p95: percentile(loggedIn.map((s) => s.loginMs), 95), max: Math.max(...loggedIn.map((s) => s.loginMs)) },
    loginQueueHintShown: students.filter((s) => s.sawQueue).length,
    submitMs: { p50: percentile(sub, 50), p95: percentile(sub, 95), max: sub.length ? Math.max(...sub) : null },
    seenOpenMs: { p50: percentile(loggedIn.map((s) => s.seenOpenMs).filter((x) => x != null), 50), p95: percentile(loggedIn.map((s) => s.seenOpenMs).filter((x) => x != null), 95) },
    seenCloseMs: { p50: percentile(loggedIn.map((s) => s.seenCloseMs).filter((x) => x != null), 50), p95: percentile(loggedIn.map((s) => s.seenCloseMs).filter((x) => x != null), 95) },
    errors: students.filter((s) => s.loginError || s.submitError).map((s) => `${s.id}: ${s.loginError ?? s.submitError}`),
    checks: Object.fromEntries(checks.map(([k, pass, v]) => [k, { pass, value: v }])),
  };
  console.log("\n===== ผล =====");
  for (const [k, pass, v] of checks) console.log(`${pass ? "✓" : "✗"} ${k}: ${v}`);
  console.log(`  ล็อกอิน (กดปุ่ม → เห็นหน้าโจทย์) p50/p95/max: ${summary.loginMs.p50}/${summary.loginMs.p95}/${summary.loginMs.max} ms · เห็นข้อความรอคิว ${summary.loginQueueHintShown} คน`);
  console.log(`  ส่งคำตอบ (กดยืนยัน → เห็นใบยืนยัน) p50/p95/max: ${summary.submitMs.p50}/${summary.submitMs.p95}/${summary.submitMs.max} ms`);
  console.log(`  เห็นโจทย์เปิด p50/p95: ${summary.seenOpenMs.p50}/${summary.seenOpenMs.p95} ms · เห็นปิด p50/p95: ${summary.seenCloseMs.p50}/${summary.seenCloseMs.p95} ms`);
  if (summary.errors.length) console.log(`  ข้อผิดพลาด: ${summary.errors.slice(0, 5).join(" | ")}`);

  const dir = path.join(ROOT, "loadtest", "results");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${summary.when.replace(/[:.]/g, "-")}-${t.target}-web-n${N}.json`);
  fs.writeFileSync(file, JSON.stringify(summary, null, 2));
  console.log(`\nบันทึกผล: ${path.relative(ROOT, file)}`);
  if (checks.some(([, pass]) => !pass)) exitCode = 1;
} catch (e) {
  console.error(`✗ ${e?.message ?? e}`);
  exitCode = 1;
} finally {
  // ปิดเบราว์เซอร์ (session ค้างใน auth จนหมดอายุ หรือถูกลบพร้อมบัญชีทดสอบ)
  await Promise.allSettled(students.filter((s) => s.context).map((s) => s.context.close()));
  await browser.close();
  if (PID) {
    try {
      await deleteLoadtestProblems(admin, PID);
      log(`ลบโจทย์ id=${PID} แล้ว`);
    } catch (e) {
      console.error(`✗ ลบโจทย์ไม่สำเร็จ: ${e?.message ?? e}`);
      exitCode = 1;
    }
  }
  process.exit(exitCode);
}
