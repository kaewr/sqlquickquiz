// สร้าง / ลบบัญชีนิสิตทดสอบ 9900xxxx ตอน LT
//
//   node loadtest/accounts.mjs create [--count 100] [--target local|prod --yes-production]
//   node loadtest/accounts.mjs delete             [--target local|prod --yes-production]
//
// create: รหัสผ่าน = รหัสนิสิต (เหมือนการนำเข้า CSV), รันซ้ำได้ (ข้ามบัญชีที่มีแล้ว)
// delete: ลบโจทย์ [LOADTEST] ก่อน แล้วลบบัญชี 9900xxxx ตอน LT ทั้งหมด
//         ถ้าบัญชีทดสอบไปส่งคำตอบในโจทย์อื่น จะหยุดและไม่ลบอะไรเลย

import {
  parseArgs, loadTarget, adminClient, fail, mapLimit,
  studentId, studentEmail, isLoadtestId, SECTION, ID_PREFIX, MAX_STUDENTS,
  deleteLoadtestProblems,
} from "./lib.mjs";

const args = parseArgs();
const cmd = args._[0];
const t = loadTarget(args);
const admin = adminClient(t);
console.log(`เป้าหมาย: ${t.target} (${new URL(t.url).host})`);

async function loadtestProfiles() {
  const { data, error } = await admin
    .from("profiles")
    .select("user_id, student_id, section")
    .like("student_id", `${ID_PREFIX}%`);
  if (error) throw error;
  return data.filter((p) => isLoadtestId(p.student_id) && p.section === SECTION);
}

async function authUsersByEmail() {
  const map = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }
  return map;
}

async function create(count) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_STUDENTS) fail(`--count ต้องอยู่ระหว่าง 1–${MAX_STUDENTS}`);
  const existing = new Set((await loadtestProfiles()).map((p) => p.student_id));
  const todo = Array.from({ length: count }, (_, i) => studentId(i + 1)).filter((id) => !existing.has(id));
  console.log(`มีแล้ว ${existing.size} บัญชี, จะสร้างเพิ่ม ${todo.length}`);

  let authMap = null;
  let created = 0;
  const failed = [];
  await mapLimit(todo, 5, async (id) => {
    const email = studentEmail(id);
    let userId;
    const { data, error } = await admin.auth.admin.createUser({ email, password: id, email_confirm: true });
    if (data?.user) userId = data.user.id;
    else if (error?.code === "email_exists") {
      authMap ??= await authUsersByEmail();
      userId = authMap.get(email);
      if (userId) await admin.auth.admin.updateUserById(userId, { password: id, ban_duration: "none" });
    }
    if (!userId) return failed.push(`${id}: ${error?.code ?? error?.message}`);
    const n = Number(id.slice(ID_PREFIX.length));
    const { error: pe } = await admin
      .from("profiles")
      .insert({ user_id: userId, student_id: id, first_name: "ทดสอบ", last_name: `LT${n}`, section: SECTION });
    if (pe) return failed.push(`${id}: profile ${pe.message}`);
    created++;
  });
  console.log(`✓ สร้าง ${created} บัญชี` + (failed.length ? `, ล้มเหลว ${failed.length}:\n  ${failed.join("\n  ")}` : ""));
  if (failed.length) process.exit(1);
}

async function remove() {
  const removedProblems = await deleteLoadtestProblems(admin);
  console.log(`ลบโจทย์ [LOADTEST] ${removedProblems} ข้อ`);

  const profiles = await loadtestProfiles();
  const ids = profiles.map((p) => p.user_id);
  if (ids.length) {
    const { data: other, error } = await admin.from("submissions").select("id, problem_id").in("student_user_id", ids);
    if (error) throw error;
    if (other.length) {
      fail(`บัญชีทดสอบมีคำตอบในโจทย์อื่น ${other.length} รายการ (problem_id: ${[...new Set(other.map((s) => s.problem_id))].join(", ")}) — ไม่ลบ ตรวจด้วยมือก่อน`);
    }
  }

  let deleted = 0;
  const failed = [];
  await mapLimit(profiles, 5, async (p) => {
    const { error } = await admin.auth.admin.deleteUser(p.user_id); // profile ลบตาม cascade
    if (error) failed.push(`${p.student_id}: ${error.message}`);
    else deleted++;
  });

  // บัญชี Auth ที่ค้างโดยไม่มี profile (เช่นสร้างล้มกลางทาง)
  const leftovers = [...(await authUsersByEmail())].filter(([email]) => {
    const m = email.match(/^(\d+)@quiz\.local$/);
    return m && isLoadtestId(m[1]);
  });
  const { data: stillProfiles } = await admin.from("profiles").select("user_id").in("user_id", leftovers.map(([, id]) => id));
  const withProfile = new Set((stillProfiles ?? []).map((p) => p.user_id));
  for (const [email, id] of leftovers) {
    if (withProfile.has(id)) continue; // มี profile ตอนอื่น ไม่ใช่ของเรา
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failed.push(`${email}: ${error.message}`);
    else deleted++;
  }

  console.log(`✓ ลบ ${deleted} บัญชี` + (failed.length ? `, ล้มเหลว ${failed.length}:\n  ${failed.join("\n  ")}` : ""));
  if (failed.length) process.exit(1);
}

try {
  if (cmd === "create") await create(Number(args.count ?? 100));
  else if (cmd === "delete") await remove();
  else fail("ใช้: node loadtest/accounts.mjs create [--count N] | delete");
} catch (e) {
  fail(e?.message ?? String(e));
}
