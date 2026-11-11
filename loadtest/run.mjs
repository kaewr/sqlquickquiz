// Load test: นิสิต N คนเปิดหน้าค้าง → อาจารย์เปิดข้อ → ทุกคนส่งภายใน --window วินาที → ปิดข้อ → ตรวจผล
//
//   node loadtest/run.mjs [--mode realtime|polling] [--students 100] [--window 60]
//                         [--drop 0] [--keep] [--target local|prod --yes-production]
//
// จำลองหน้านิสิตตาม src/components/student/current-problems.tsx:
//   - subscribe problem-state (private) เสมอ, problem-counts เฉพาะโหมด realtime
//   - โหมด polling ถาม problem_status ทุก 5 วินาที
//   - ต่อกลับมาได้ → ดึงสถานะใหม่ (resync)
// จำลองหน้าอาจารย์ด้วย service key: subscribe problem-submissions:<id>
// ต้องสร้างบัญชีก่อน: node loadtest/accounts.mjs create --count N

import fs from "node:fs";
import path from "node:path";
import {
  ROOT, parseArgs, loadTarget, adminClient, studentClient, fail, sleep, mapLimit, percentile,
  studentId, studentEmail, TITLE_PREFIX, MAX_STUDENTS, deleteLoadtestProblems,
} from "./lib.mjs";

const POLL_MS = 5000;
const JOIN_PER_SECOND = 20; // กระจายการ join ช่อง ไม่ให้ชนเพดาน join ต่อวินาทีของ Realtime

const args = parseArgs();
const mode = args.mode ?? "realtime";
const N = Number(args.students ?? 100);
const WINDOW_S = Number(args.window ?? 60);
const DROP = Number(args.drop ?? 0);
const LOGIN_RATE = Number(args["login-rate"] ?? 3); // คน/วินาที (เพดาน Auth ≈ 1000/5 นาที ≈ 3.3/วินาที)
if (!["realtime", "polling"].includes(mode)) fail("--mode ต้องเป็น realtime หรือ polling");
if (!Number.isInteger(N) || N < 1 || N > MAX_STUDENTS) fail(`--students ต้องอยู่ระหว่าง 1–${MAX_STUDENTS}`);
if (!(WINDOW_S > 0 && WINDOW_S <= 600)) fail("--window ต้องอยู่ระหว่าง 1–600 วินาที");
if (!Number.isInteger(DROP) || DROP < 0 || DROP > N) fail("--drop ต้องอยู่ระหว่าง 0–จำนวนนิสิต");

const t = loadTarget(args);
const admin = adminClient(t);
const log = (...a) => console.log(`[${((Date.now() - T_START) / 1000).toFixed(1).padStart(6)}s]`, ...a);
const T_START = Date.now();
console.log(`เป้าหมาย: ${t.target} (${new URL(t.url).host}) · โหมด ${mode} · นิสิต ${N} · ส่งภายใน ${WINDOW_S}s · ตัดการเชื่อมต่อ ${DROP}`);

function waitSubscribed(channel, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT"), timeoutMs);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
}

// ---------- เตรียมโจทย์ ----------
const title = `${TITLE_PREFIX} ${new Date().toISOString()} ${mode} n=${N}`;
const { data: problem, error: pErr } = await admin
  .from("problems")
  .insert({ title, description: "โจทย์ทดสอบภาระ — ลบอัตโนมัติ", max_score: 10 })
  .select("id")
  .single();
if (pErr) fail(`สร้างโจทย์ไม่ได้: ${pErr.message}`);
const PID = problem.id;
log(`สร้างโจทย์ id=${PID}`);

let exitCode = 0;
const students = [];
let instructor = null;
try {
  // ---------- อาจารย์ ----------
  instructor = { seen: new Set(), messages: 0, stateMessages: 0 };
  await admin.realtime.setAuth();
  const subCh = admin
    .channel(`problem-submissions:${PID}`, { config: { private: true } })
    .on("broadcast", { event: "submission" }, ({ payload }) => {
      instructor.messages++;
      instructor.seen.add(String(payload.submission_id));
    });
  const instStatus = await waitSubscribed(subCh);
  if (instStatus !== "SUBSCRIBED") throw new Error(`อาจารย์ subscribe problem-submissions ไม่ได้: ${instStatus}`);
  log("อาจารย์ subscribe แล้ว");

  // ---------- นิสิต: ล็อกอิน ----------
  const signInMs = [];
  const signInFail = [];
  for (let i = 1; i <= N; i++) {
    students.push({
      n: i, id: studentId(i), client: studentClient(t), channels: [],
      msg: { state: 0, count: 0 }, polls: 0, pollErrors: 0, lastCount: 0,
      openAt: null, closeAt: null, openVia: null, joinStatus: [], resyncs: 0,
      submit: null, dropped: false,
    });
  }
  // ทยอยเข้าตาม --login-rate คน/วินาที; โดนเพดาน → รอ 5 วินาทีแล้วลองใหม่ (เหมือนนิสิตกดซ้ำ)
  let loginRetries = 0;
  const loginT0 = Date.now();
  await mapLimit(students, 20, async (s, i) => {
    const due = loginT0 + (i / LOGIN_RATE) * 1000;
    if (due > Date.now()) await sleep(due - Date.now());
    for (let attempt = 1; ; attempt++) {
      const t0 = Date.now();
      const { error } = await s.client.auth.signInWithPassword({ email: studentEmail(s.id), password: s.id });
      if (!error) return signInMs.push(Date.now() - t0);
      if (error.code === "over_request_rate_limit" && attempt < 10) {
        loginRetries++;
        await sleep(5000);
        continue;
      }
      return signInFail.push(`${s.id}: ${error.code ?? error.message}`);
    }
  });
  log(`ใช้เวลาล็อกอิน ${((Date.now() - loginT0) / 1000).toFixed(1)}s · โดนเพดานแล้วลองใหม่ ${loginRetries} ครั้ง`);
  if (signInFail.length) throw new Error(`ล็อกอินไม่ผ่าน ${signInFail.length} คน (สร้างบัญชีหรือยัง?): ${signInFail.slice(0, 5).join(", ")}`);
  log(`ล็อกอินครบ ${N} คน (p50 ${percentile(signInMs, 50)}ms, p95 ${percentile(signInMs, 95)}ms)`);

  // ---------- นิสิต: subscribe ----------
  let opened = false; // อาจารย์สั่งเปิดแล้ว (ใช้ตอน resync)
  let tOpen = 0;
  let tClose = 0;

  function scheduleSubmit(s) {
    if (s.submit) return;
    const delay = Math.random() * WINDOW_S * 1000;
    s.submit = { scheduledMs: Math.round(delay), state: "waiting" };
    setTimeout(() => void doSubmit(s), delay);
  }

  async function doSubmit(s, attempt = 1) {
    const t0 = Date.now();
    const { data, error } = await s.client.rpc("submit_answer", {
      p_problem_id: PID,
      p_sql_text: `SELECT * FROM t WHERE student = '${s.id}'; -- loadtest ${attempt}`,
    });
    const ms = Date.now() - t0;
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      Object.assign(s.submit, { state: "ok", order: row.submit_order, latencyMs: ms, attempts: attempt });
    } else if (error.message === "ALREADY_SUBMITTED" && attempt > 1) {
      Object.assign(s.submit, { state: "ok", order: null, latencyMs: ms, attempts: attempt, note: "ALREADY_SUBMITTED หลัง retry" });
    } else if (attempt < 3 && !["PROBLEM_CLOSED", "NOT_STUDENT", "INVALID_SQL_TEXT", "ALREADY_SUBMITTED"].includes(error.message)) {
      s.submit.retryErrors = [...(s.submit.retryErrors ?? []), error.message || error.code || "unknown"];
      await sleep(2000); // เหมือนนิสิตกดส่งซ้ำเมื่อเน็ตสะดุด
      return doSubmit(s, attempt + 1);
    } else {
      Object.assign(s.submit, { state: "error", error: error.message, latencyMs: ms, attempts: attempt });
    }
  }

  async function resync(s) {
    s.resyncs++;
    const { data } = await s.client.from("problem_status").select("is_open, submission_count").eq("problem_id", PID).maybeSingle();
    if (!data) return;
    s.lastCount = Math.max(s.lastCount, data.submission_count);
    if (data.is_open && !s.openAt) {
      s.openAt = Date.now();
      s.openVia = "resync";
      scheduleSubmit(s);
    }
    if (!data.is_open && opened && !s.closeAt && tClose) {
      s.closeAt = Date.now();
    }
  }

  async function subscribe(s, isReconnect = false) {
    await s.client.realtime.setAuth();
    const state = s.client
      .channel("problem-state", { config: { private: true } })
      .on("broadcast", { event: "state" }, ({ payload }) => {
        s.msg.state++;
        if (Number(payload.problem_id) !== PID) return;
        if (payload.is_open && !s.openAt) {
          s.openAt = Date.now();
          s.openVia = "broadcast";
          scheduleSubmit(s);
        } else if (!payload.is_open && !s.closeAt) {
          s.closeAt = Date.now();
        }
      });
    s.channels = [state];
    const st = await waitSubscribed(state);
    s.joinStatus.push(st);
    if (mode === "realtime") {
      const counts = s.client
        .channel("problem-counts", { config: { private: true } })
        .on("broadcast", { event: "count" }, ({ payload }) => {
          s.msg.count++;
          if (Number(payload.problem_id) === PID) s.lastCount = Math.max(s.lastCount, Number(payload.submission_count));
        });
      s.channels.push(counts);
      s.joinStatus.push(await waitSubscribed(counts));
    }
    if (isReconnect) await resync(s);
  }

  const joinT0 = Date.now();
  await mapLimit(students, JOIN_PER_SECOND, async (s, i) => {
    // ปล่อยทีละ JOIN_PER_SECOND คนต่อวินาที
    const due = joinT0 + Math.floor(i / JOIN_PER_SECOND) * 1000;
    if (due > Date.now()) await sleep(due - Date.now());
    await subscribe(s);
  });
  const badJoins = students.filter((s) => s.joinStatus.some((x) => x !== "SUBSCRIBED"));
  log(`subscribe ครบ ${N - badJoins.length}/${N} คน (${((Date.now() - joinT0) / 1000).toFixed(1)}s)`);
  if (badJoins.length) log(`  ⚠ ไม่สำเร็จ: ${badJoins.slice(0, 5).map((s) => `${s.id}=${s.joinStatus.join("/")}`).join(", ")}`);

  // ---------- polling ----------
  let pollTimer = null;
  if (mode === "polling") {
    pollTimer = setInterval(() => {
      for (const s of students) {
        if (s.dropped) continue;
        s.polls++;
        s.client
          .from("problem_status")
          .select("problem_id, submission_count")
          .in("problem_id", [PID])
          .then(({ data, error }) => {
            if (error) s.pollErrors++;
            for (const row of data ?? []) s.lastCount = Math.max(s.lastCount, row.submission_count);
          });
      }
    }, POLL_MS);
  }

  await sleep(2000);

  // ---------- เปิดข้อ ----------
  tOpen = Date.now();
  const { error: openErr } = await admin.from("problem_status").update({ is_open: true }).eq("problem_id", PID);
  if (openErr) throw new Error(`เปิดข้อไม่ได้: ${openErr.message}`);
  opened = true;
  log("เปิดข้อแล้ว");

  // นิสิตที่ไม่ได้ broadcast เปิดข้อใน 15 วินาที → resync (เทียบกับนิสิตที่สลับแท็บกลับมา)
  setTimeout(() => {
    for (const s of students) if (!s.openAt) void resync(s);
  }, 15000);

  // ---------- ตัดการเชื่อมต่อกลางทาง ----------
  if (DROP > 0) {
    setTimeout(async () => {
      const victims = [...students].sort(() => Math.random() - 0.5).slice(0, DROP);
      log(`ตัดการเชื่อมต่อ ${DROP} คน 10 วินาที`);
      for (const v of victims) {
        v.dropped = true;
        await v.client.removeAllChannels();
      }
      await sleep(10000);
      await Promise.all(victims.map(async (v) => {
        v.dropped = false;
        await subscribe(v, true);
      }));
      log(`ต่อกลับครบ ${DROP} คน`);
    }, WINDOW_S * 300);
  }

  // ---------- รอทุกคนส่งเสร็จ ----------
  const deadline = tOpen + (WINDOW_S + 60) * 1000;
  let lastReport = 0;
  while (Date.now() < deadline) {
    const done = students.filter((s) => s.submit && s.submit.state !== "waiting").length;
    if (done === N) break;
    if (Date.now() - lastReport > 10000) {
      log(`ส่งแล้ว ${done}/${N}`);
      lastReport = Date.now();
    }
    await sleep(500);
  }
  await sleep(5000); // ให้ broadcast ตัวนับสุดท้ายมาถึง

  // ---------- ปิดข้อ ----------
  tClose = Date.now();
  const { error: closeErr } = await admin.from("problem_status").update({ is_open: false }).eq("problem_id", PID);
  if (closeErr) throw new Error(`ปิดข้อไม่ได้: ${closeErr.message}`);
  log("ปิดข้อแล้ว");
  const closeDeadline = Date.now() + 15000;
  while (Date.now() < closeDeadline && students.some((s) => !s.closeAt)) await sleep(250);
  if (mode === "polling") await sleep(POLL_MS + 1000);
  if (pollTimer) clearInterval(pollTimer);

  // ---------- ตรวจผล ----------
  const { data: subs, error: sErr } = await admin.from("submissions").select("id, submit_order").eq("problem_id", PID);
  if (sErr) throw sErr;
  const { data: status } = await admin.from("problem_status").select("submission_count").eq("problem_id", PID).single();
  const orders = subs.map((r) => r.submit_order).sort((a, b) => a - b);
  const ordersOk = orders.length === N && orders.every((o, i) => o === i + 1);

  const ok = students.filter((s) => s.submit?.state === "ok");
  const errs = students.filter((s) => s.submit?.state === "error");
  const never = students.filter((s) => !s.submit);
  const lat = ok.map((s) => s.submit.latencyMs);
  const openLat = students.filter((s) => s.openVia === "broadcast").map((s) => s.openAt - tOpen);
  const closeLat = students.filter((s) => s.closeAt).map((s) => s.closeAt - tClose);
  const msgState = students.reduce((a, s) => a + s.msg.state, 0);
  const msgCount = students.reduce((a, s) => a + s.msg.count, 0);
  const polls = students.reduce((a, s) => a + s.polls, 0);
  const pollErrors = students.reduce((a, s) => a + s.pollErrors, 0);
  const finalCountOk = students.filter((s) => s.lastCount === N).length;

  const checks = [
    ["ส่งสำเร็จครบ", ok.length === N, `${ok.length}/${N}` + (errs.length ? ` (ผิดพลาด: ${[...new Set(errs.map((s) => s.submit.error))].join(", ")})` : "") + (never.length ? ` (ไม่ได้ส่ง ${never.length})` : "")],
    ["submissions ในฐานข้อมูล", subs.length === N, `${subs.length}`],
    ["problem_status.submission_count", status?.submission_count === N, `${status?.submission_count}`],
    ["submit_order = 1..N ไม่ซ้ำ", ordersOk, ordersOk ? "ถูกต้อง" : `ได้ ${orders.slice(0, 10).join(",")}…`],
    ["อาจารย์เห็นครบ", instructor.seen.size === N, `${instructor.seen.size}/${N}`],
    ["ได้ broadcast เปิดข้อ", openLat.length === N, `${openLat.length}/${N}` + (N - openLat.length ? ` (resync ${students.filter((s) => s.openVia === "resync").length})` : "")],
    ["ได้ broadcast ปิดข้อ", closeLat.length === N, `${closeLat.length}/${N}`],
    ["ตัวนับฝั่งนิสิตถึง N", finalCountOk === N, `${finalCountOk}/${N}`],
  ];

  const summary = {
    when: new Date().toISOString(), target: t.target, mode, students: N, windowS: WINDOW_S, drop: DROP, problemId: PID,
    loginRate: LOGIN_RATE, loginRetries,
    signInMs: { p50: percentile(signInMs, 50), p95: percentile(signInMs, 95), max: Math.max(...signInMs) },
    submitMs: { p50: percentile(lat, 50), p95: percentile(lat, 95), max: lat.length ? Math.max(...lat) : null },
    retries: ok.filter((s) => s.submit.attempts > 1).length,
    retryErrors: students.flatMap((s) => s.submit?.retryErrors ?? []),
    openBroadcastMs: { p50: percentile(openLat, 50), p95: percentile(openLat, 95), max: openLat.length ? Math.max(...openLat) : null },
    closeBroadcastMs: { p50: percentile(closeLat, 50), p95: percentile(closeLat, 95), max: closeLat.length ? Math.max(...closeLat) : null },
    messagesReceived: {
      "problem-state": msgState,
      "problem-counts": msgCount,
      "problem-submissions (อาจารย์)": instructor.messages,
      total: msgState + msgCount + instructor.messages,
    },
    polling: mode === "polling" ? { requests: polls, errors: pollErrors } : null,
    resyncs: students.reduce((a, s) => a + s.resyncs, 0),
    channelJoinFailures: badJoins.length,
    checks: Object.fromEntries(checks.map(([k, pass, v]) => [k, { pass, value: v }])),
  };

  console.log("\n===== ผล =====");
  for (const [k, pass, v] of checks) console.log(`${pass ? "✓" : "✗"} ${k}: ${v}`);
  console.log(`  ล็อกอิน p50/p95/max: ${summary.signInMs.p50}/${summary.signInMs.p95}/${summary.signInMs.max} ms`);
  console.log(`  ส่งคำตอบ p50/p95/max: ${summary.submitMs.p50}/${summary.submitMs.p95}/${summary.submitMs.max} ms · retry ${summary.retries}` + (summary.retryErrors.length ? ` (${[...new Set(summary.retryErrors)].join(", ")})` : ""));
  console.log(`  broadcast เปิด p50/p95/max: ${summary.openBroadcastMs.p50}/${summary.openBroadcastMs.p95}/${summary.openBroadcastMs.max} ms`);
  console.log(`  broadcast ปิด p50/p95/max: ${summary.closeBroadcastMs.p50}/${summary.closeBroadcastMs.p95}/${summary.closeBroadcastMs.max} ms`);
  console.log(`  ข้อความ realtime ที่ client ได้รับ:`, summary.messagesReceived);
  if (summary.polling) console.log(`  polling: ${polls} ครั้ง (ผิดพลาด ${pollErrors})`);

  const dir = path.join(ROOT, "loadtest", "results");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${summary.when.replace(/[:.]/g, "-")}-${t.target}-${mode}-n${N}.json`);
  fs.writeFileSync(file, JSON.stringify(summary, null, 2));
  console.log(`\nบันทึกผล: ${path.relative(ROOT, file)}`);

  if (checks.some(([, pass]) => !pass)) exitCode = 1;
} catch (e) {
  console.error(`✗ ${e?.message ?? e}`);
  exitCode = 1;
} finally {
  await Promise.allSettled(students.map((s) => s.client.removeAllChannels()));
  await admin.removeAllChannels();
  if (args.keep) log(`เก็บโจทย์ id=${PID} ไว้ (--keep) — ลบภายหลังด้วย accounts.mjs delete`);
  else {
    try {
      await deleteLoadtestProblems(admin, PID);
      log(`ลบโจทย์ id=${PID} แล้ว`);
    } catch (e) {
      console.error(`✗ ลบโจทย์ไม่สำเร็จ: ${e?.message ?? e} — ใช้ accounts.mjs delete ลบซ้ำ`);
      exitCode = 1;
    }
  }
  process.exit(exitCode);
}
