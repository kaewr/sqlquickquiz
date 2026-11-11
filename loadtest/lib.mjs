// ส่วนกลางของสคริปต์ load test: อ่านค่า env ตามเป้าหมาย + ด่านกันยิงผิดที่
//
//   --target local  (ค่าเริ่มต้น) อ่าน .env.local และยอมเฉพาะ Supabase บนเครื่อง
//   --target prod   อ่าน .env.loadtest และต้องใส่ --yes-production ด้วยเสมอ
//
// ข้อมูลที่สคริปต์สร้าง: บัญชี 99000001..990000NN ตอน LT, โจทย์ชื่อขึ้นต้น [LOADTEST]
// สคริปต์แตะเฉพาะข้อมูลเหล่านี้เท่านั้น

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PROD_REF = "anyvflatoeedytlrntmp";
export const SECTION = "LT";
export const ID_PREFIX = "9900";
export const TITLE_PREFIX = "[LOADTEST]";
export const MAX_STUDENTS = 200;

export function studentId(n) {
  return ID_PREFIX + String(n).padStart(4, "0");
}
export function isLoadtestId(id) {
  return /^9900\d{4}$/.test(id);
}
export function studentEmail(id) {
  return `${id}@quiz.local`;
}

/** อ่านอาร์กิวเมนต์แบบ --key value / --flag */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function readEnvFile(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) throw new Error(`ไม่พบไฟล์ ${file}`);
  const env = {};
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

/** คืน { target, url, publishableKey, secretKey } หรือจบโปรแกรมถ้าเป้าหมายไม่ปลอดภัย */
export function loadTarget(args) {
  const target = args.target ?? "local";
  let url, publishableKey, secretKey;

  if (target === "local") {
    const env = readEnvFile(".env.local");
    url = env.NEXT_PUBLIC_SUPABASE_URL;
    publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    secretKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const host = url ? new URL(url).hostname : "";
    if (host !== "127.0.0.1" && host !== "localhost") {
      fail(`--target local แต่ .env.local ชี้ไปที่ ${host} — ยอมเฉพาะ Supabase บนเครื่อง`);
    }
  } else if (target === "prod") {
    if (args["yes-production"] !== true) {
      fail("--target prod ต้องใส่ --yes-production ด้วย (ยิงใส่ project จริง)");
    }
    const env = readEnvFile(".env.loadtest");
    url = env.LOADTEST_SUPABASE_URL;
    publishableKey = env.LOADTEST_PUBLISHABLE_KEY;
    secretKey = env.LOADTEST_SECRET_KEY;
    if (url !== `https://${PROD_REF}.supabase.co`) fail("LOADTEST_SUPABASE_URL ไม่ใช่ project ที่ตกลงกันไว้");
  } else {
    fail(`ไม่รู้จัก --target ${target} (local | prod)`);
  }

  if (!url || !publishableKey || !secretKey) fail("ค่า URL / publishable key / secret key ไม่ครบ");
  return { target, url, publishableKey, secretKey };
}

export function adminClient(t) {
  return createClient(t.url, t.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function studentClient(t) {
  return createClient(t.url, t.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { log_level: "error" } },
  });
}

export function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** รัน fn กับทุกตัวใน items ทีละ limit ตัวพร้อมกัน */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function percentile(values, p) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

/** ลบโจทย์ [LOADTEST] ทั้งหมดพร้อมคะแนน/คำตอบ (สถานะ/เฉลยลบตาม cascade) */
export async function deleteLoadtestProblems(admin, onlyId) {
  let q = admin.from("problems").select("id, title").like("title", `${TITLE_PREFIX}%`);
  if (onlyId) q = q.eq("id", onlyId);
  const { data: problems, error } = await q;
  if (error) throw error;
  for (const p of problems) {
    if (!p.title.startsWith(TITLE_PREFIX)) continue; // กันไว้อีกชั้น
    await admin.from("problem_status").update({ is_open: false }).eq("problem_id", p.id).eq("is_open", true);
    const { data: subs, error: e1 } = await admin.from("submissions").select("id").eq("problem_id", p.id);
    if (e1) throw e1;
    const ids = subs.map((s) => s.id);
    for (let i = 0; i < ids.length; i += 500) {
      const { error: e2 } = await admin.from("results").delete().in("submission_id", ids.slice(i, i + 500));
      if (e2) throw e2;
    }
    const { error: e3 } = await admin.from("submissions").delete().eq("problem_id", p.id);
    if (e3) throw e3;
    const { error: e4 } = await admin.from("problems").delete().eq("id", p.id);
    if (e4) throw e4;
  }
  return problems.length;
}
