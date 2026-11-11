// วัดเพดานล็อกอิน: นิสิตทดสอบ N คนกดเข้าสู่ระบบพร้อมกัน (--rate คน/วินาที)
// คนที่โดน over_request_rate_limit ลองใหม่ทุก --retry-ms จนเข้าได้ แล้ววัดว่าทุกคนเข้าครบในกี่วินาที
//
//   node loadtest/login-burst.mjs [--students 110] [--rate 50] [--retry-ms 1000]
//                                 [--target local|prod --yes-production]
// ต้องสร้างบัญชีก่อน: node loadtest/accounts.mjs create --count N

import fs from "node:fs";
import path from "node:path";
import {
  ROOT, parseArgs, loadTarget, studentClient, fail, sleep, percentile, studentId, studentEmail, MAX_STUDENTS,
} from "./lib.mjs";

const args = parseArgs();
const N = Number(args.students ?? 110);
const RATE = Number(args.rate ?? 50);
const RETRY_MS = Number(args["retry-ms"] ?? 1000);
if (!Number.isInteger(N) || N < 1 || N > MAX_STUDENTS) fail(`--students ต้องอยู่ระหว่าง 1–${MAX_STUDENTS}`);
if (!(RATE > 0 && RATE <= 200)) fail("--rate ต้องอยู่ระหว่าง 1–200");
if (!(RETRY_MS >= 500)) fail("--retry-ms ต้องไม่น้อยกว่า 500");

const t = loadTarget(args);
console.log(`เป้าหมาย: ${t.target} (${new URL(t.url).host}) · นิสิต ${N} · กดเข้า ${RATE} คน/วินาที · ลองใหม่ทุก ${RETRY_MS} ms`);

const T0 = Date.now();
const people = Array.from({ length: N }, (_, i) => ({ id: studentId(i + 1), client: studentClient(t), attempts: 0, okAt: null, firstLimitedAt: null }));
const otherErrors = [];

await Promise.all(people.map(async (p, i) => {
  await sleep((i / RATE) * 1000);
  for (;;) {
    p.attempts++;
    const { error } = await p.client.auth.signInWithPassword({ email: studentEmail(p.id), password: p.id });
    if (!error) {
      p.okAt = Date.now() - T0;
      return;
    }
    if (error.code !== "over_request_rate_limit") {
      otherErrors.push(`${p.id}: ${error.code ?? error.message}`);
      return;
    }
    p.firstLimitedAt ??= Date.now() - T0;
    if (Date.now() - T0 > 120000) {
      otherErrors.push(`${p.id}: ยังเข้าไม่ได้หลัง 120 วินาที`);
      return;
    }
    await sleep(RETRY_MS);
  }
}));

// ออกจากระบบทุก session ที่สร้าง (scope local = เฉพาะ session นี้)
await Promise.allSettled(people.filter((p) => p.okAt !== null).map((p) => p.client.auth.signOut({ scope: "local" })));

const ok = people.filter((p) => p.okAt !== null);
const firstTry = people.filter((p) => p.okAt !== null && p.attempts === 1).length;
const limited = people.filter((p) => p.firstLimitedAt !== null);
const okTimes = ok.map((p) => p.okAt).sort((a, b) => a - b);
const sendWindow = ((N - 1) / RATE) * 1000;
const firstLimit = limited.length ? Math.min(...limited.map((p) => p.firstLimitedAt)) : null;

const summary = {
  when: new Date().toISOString(), target: t.target, students: N, rate: RATE, retryMs: RETRY_MS,
  ok: ok.length, okFirstTry: firstTry, rateLimitedPeople: limited.length,
  attemptsTotal: people.reduce((a, p) => a + p.attempts, 0),
  firstRateLimitAtMs: firstLimit,
  allInAtMs: ok.length === N ? okTimes.at(-1) : null,
  sendWindowMs: Math.round(sendWindow),
  waitMs: { p50: percentile(ok.map((p) => p.okAt), 50), p95: percentile(ok.map((p) => p.okAt), 95) },
  otherErrors,
};

console.log("\n===== ผล =====");
console.log(`เข้าได้ ${ok.length}/${N} · ผ่านครั้งแรก ${firstTry} · โดนเพดาน ${limited.length} คน · ส่งคำขอรวม ${summary.attemptsTotal} ครั้ง`);
console.log(`โดนเพดานครั้งแรกที่ ${firstLimit ?? "—"} ms`);
console.log(`ทุกคนเข้าครบที่ ${summary.allInAtMs === null ? "—" : (summary.allInAtMs / 1000).toFixed(1) + " วินาที"} (ช่วงกดเข้า ${(sendWindow / 1000).toFixed(1)} วินาที)`);
if (otherErrors.length) console.log(`ข้อผิดพลาดอื่น: ${otherErrors.slice(0, 5).join(", ")}`);

const dir = path.join(ROOT, "loadtest", "results");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${summary.when.replace(/[:.]/g, "-")}-${t.target}-login-n${N}-r${RATE}.json`);
fs.writeFileSync(file, JSON.stringify(summary, null, 2));
console.log(`บันทึกผล: ${path.relative(ROOT, file)}`);
process.exit(ok.length === N ? 0 : 1);
