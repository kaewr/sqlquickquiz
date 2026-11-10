/**
 * ตัวช่วยเทสต์: ใช้ Supabase บนเครื่อง (ค่าจาก .env.local) — service key ใช้เฉพาะในเทสต์นี้
 * ห้ามรันกับ project จริง
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(URL ?? "")) {
  throw new Error(`E2E tests must run against local Supabase, got ${URL}`);
}

export const INSTRUCTOR = { email: "instructor@example.com", password: "instructor-local" };

export function adminClient(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): SupabaseClient {
  return createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** รหัสนิสิตสุ่ม 8 หลัก ขึ้นต้น 69 (ไม่ชนกับ seed 6500xxxx) */
export function randomStudentId(): string {
  return "69" + String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export type TestStudent = { userId: string; studentId: string; password: string };

export async function createStudent(
  opts: { studentId?: string; password?: string; passwordChanged?: boolean; section?: string } = {},
): Promise<TestStudent> {
  const admin = adminClient();
  const studentId = opts.studentId ?? randomStudentId();
  const password = opts.password ?? studentId;
  const { data, error } = await admin.auth.admin.createUser({
    email: `${studentId}@quiz.local`,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const { error: pErr } = await admin.from("profiles").insert({
    user_id: data.user.id,
    student_id: studentId,
    first_name: "ทดสอบ",
    last_name: "อัตโนมัติ",
    section: opts.section ?? "9",
    password_changed: opts.passwordChanged ?? false,
  });
  if (pErr) throw new Error(`profile insert failed: ${pErr.message}`);
  return { userId: data.user.id, studentId, password };
}

/** ลบนิสิตทดสอบพร้อมคำตอบ/ผลตรวจ */
export async function deleteStudentById(studentId: string) {
  const admin = adminClient();
  const { data: p } = await admin.from("profiles").select("user_id").eq("student_id", studentId).maybeSingle();
  if (!p) return;
  const { data: subs } = await admin.from("submissions").select("id").eq("student_user_id", p.user_id);
  const ids = (subs ?? []).map((s) => s.id);
  if (ids.length) {
    await admin.from("results").delete().in("submission_id", ids);
    await admin.from("submissions").delete().in("id", ids);
  }
  await admin.auth.admin.deleteUser(p.user_id);
}

/** cookie ของ session (รูปแบบเดียวกับ @supabase/ssr) สำหรับใส่ให้ browser context */
export async function sessionCookies(email: string, password: string, baseURL: string) {
  const captured: { name: string; value: string }[] = [];
  const client = createServerClient(URL, PUBLISHABLE, {
    cookies: {
      getAll: () => [],
      setAll: (cookies) => {
        for (const c of cookies) captured.push({ name: c.name, value: c.value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed: ${error.message}`);
  return captured.filter((c) => c.value).map((c) => ({ ...c, url: baseURL, sameSite: "Lax" as const }));
}

/** ลองล็อกอินด้วยรหัสนิสิต — คืนรหัสข้อผิดพลาดหรือ null ถ้าสำเร็จ */
export async function tryStudentLogin(studentId: string, password: string): Promise<string | null> {
  const { error } = await anonClient().auth.signInWithPassword({ email: `${studentId}@quiz.local`, password });
  return error ? (error.code ?? error.message) : null;
}

// ---------- โจทย์ (เปิด/ปิดด้วย service key — หน้าอาจารย์สำหรับเปิด/ปิดอยู่ในระยะ 4) ----------

export async function createProblem(
  opts: { title?: string; open?: boolean; description?: string; schemaInfo?: string; expected?: string } = {},
): Promise<number> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("problems")
    .insert({
      title: opts.title ?? `โจทย์ทดสอบ ${Math.random().toString(36).slice(2, 8)}`,
      description: opts.description ?? "แสดง **ชื่อเมือง** ทั้งหมด",
      schema_info: opts.schemaInfo ?? "```\ncity(ID, Name)\n```",
      expected_example: opts.expected ?? "| Name |\n| --- |\n| Bangkok |",
    })
    .select("id")
    .single();
  if (error) throw new Error(`create problem failed: ${error.message}`);
  await admin.from("problem_solutions").insert({ problem_id: data.id, reference_sql: "SELECT SECRET_SOLUTION;" });
  if (opts.open ?? true) await setProblemOpen(data.id, true);
  return data.id;
}

export async function setProblemOpen(problemId: number, open: boolean) {
  const { error } = await adminClient().from("problem_status").update({ is_open: open }).eq("problem_id", problemId);
  if (error) throw new Error(`set open failed: ${error.message}`);
}

export async function deleteProblem(problemId: number) {
  const admin = adminClient();
  const { data: subs } = await admin.from("submissions").select("id").eq("problem_id", problemId);
  const ids = (subs ?? []).map((s) => s.id);
  if (ids.length) {
    await admin.from("results").delete().in("submission_id", ids);
    await admin.from("submissions").delete().in("id", ids);
  }
  await admin.from("problems").delete().eq("id", problemId);
}

/** ส่งคำตอบในนามนิสิต (ผ่าน submit_answer จริง) */
export async function submitAs(student: TestStudent, problemId: number, sql = "SELECT 1;") {
  const client = anonClient();
  await client.auth.signInWithPassword({ email: `${student.studentId}@quiz.local`, password: student.password });
  const { data, error } = await client.rpc("submit_answer", { p_problem_id: problemId, p_sql_text: sql });
  if (error) throw new Error(`submit failed: ${error.message}`);
  return data;
}
