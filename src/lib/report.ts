import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isIsoDate } from "@/lib/problem-form";
import { formatScore } from "@/lib/grading";
import { problemNumbers } from "@/lib/problem-numbers";

export type ReportFilter = { from: string | null; to: string | null; section: string | null };

/** number = หมายเลขข้อ (ลำดับเวลาเปิดครั้งแรกของโจทย์ทั้งหมด) */
export type ReportProblem = { id: number; number: number | null; title: string; day: string; max_score: number };
export type ReportCell = { submitted: boolean; score: number | null };
export type ReportStudent = {
  student_id: string;
  first_name: string;
  last_name: string;
  section: string;
  is_active: boolean;
  cells: Record<number, ReportCell>;
  submitted: number;
  total: number;
};
export type Report = { problems: ReportProblem[]; students: ReportStudent[]; maxTotal: number };

type ViewRow = {
  student_id: string;
  first_name: string;
  last_name: string;
  section: string;
  is_active: boolean;
  problem_id: number;
  title: string;
  day: string;
  max_score: number | string;
  submitted: boolean;
  score: number | string | null;
};

const PAGE = 1000; // เพดานแถวต่อครั้งของ Supabase

export function parseReportFilter(params: Record<string, string | string[] | undefined>): ReportFilter {
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : null);
  const from = one(params.from);
  const to = one(params.to);
  return { from: isIsoDate(from) ? from : null, to: isIsoDate(to) ? to : null, section: one(params.section) };
}

/**
 * รายงานรายคน: นิสิต × โจทย์ที่เปิดครั้งแรกในช่วงวันที่ (Asia/Bangkok)
 * อ่านจาก v_student_problem_scores ด้วย session ของอาจารย์ (RLS) — ดึงเป็นช่วงจนครบ
 */
export async function buildReport(supabase: SupabaseClient, filter: ReportFilter): Promise<Report> {
  const numbersPromise = problemNumbers(supabase);
  const rows: ViewRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("v_student_problem_scores")
      .select("student_id, first_name, last_name, section, is_active, problem_id, title, day, max_score, submitted, score")
      .order("student_id")
      .order("problem_id")
      .range(offset, offset + PAGE - 1);
    if (filter.from) q = q.gte("day", filter.from);
    if (filter.to) q = q.lte("day", filter.to);
    if (filter.section) q = q.eq("section", filter.section);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data ?? []) as ViewRow[]));
    if (!data || data.length < PAGE) break;
  }

  const problems = new Map<number, ReportProblem>();
  const students = new Map<string, ReportStudent>();
  for (const r of rows) {
    if (!problems.has(r.problem_id)) {
      problems.set(r.problem_id, { id: r.problem_id, number: null, title: r.title, day: r.day, max_score: Number(r.max_score) });
    }
    let s = students.get(r.student_id);
    if (!s) {
      s = {
        student_id: r.student_id,
        first_name: r.first_name,
        last_name: r.last_name,
        section: r.section,
        is_active: r.is_active,
        cells: {},
        submitted: 0,
        total: 0,
      };
      students.set(r.student_id, s);
    }
    const score = r.score === null ? null : Number(r.score);
    s.cells[r.problem_id] = { submitted: r.submitted, score };
    if (r.submitted) s.submitted++;
    if (score !== null) s.total = Math.round((s.total + score) * 100) / 100;
  }

  const numbers = await numbersPromise;
  for (const p of problems.values()) p.number = numbers.get(p.id) ?? null;
  const problemList = [...problems.values()].sort(
    (a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.day.localeCompare(b.day) || a.id - b.id,
  );
  const maxTotal = Math.round(problemList.reduce((t, p) => t + p.max_score, 0) * 100) / 100;
  const studentList = [...students.values()].sort(
    (a, b) => a.section.localeCompare(b.section, "th") || a.student_id.localeCompare(b.student_id),
  );
  return { problems: problemList, students: studentList, maxTotal };
}

/** ค่าในช่อง: ว่าง = ไม่ได้ส่ง, "รอตรวจ" = ส่งแล้วยังไม่ให้คะแนน */
export function cellText(cell: ReportCell | undefined): string {
  if (!cell || !cell.submitted) return "";
  return cell.score === null ? "รอตรวจ" : formatScore(cell.score);
}

export function reportRows(report: Report): (string | number)[][] {
  const header = [
    "รหัสนิสิต",
    "ชื่อ",
    "นามสกุล",
    "ตอน",
    "สถานะบัญชี",
    ...report.problems.map((p) => `${p.day} ${p.title} (เต็ม ${formatScore(p.max_score)})`),
    "จำนวนข้อที่ส่ง",
    "คะแนนรวม",
    "คะแนนเต็มรวม",
  ];
  const body = report.students.map((s) => [
    s.student_id,
    s.first_name,
    s.last_name,
    s.section,
    s.is_active ? "ใช้งาน" : "ปิดบัญชี",
    ...report.problems.map((p) => cellText(s.cells[p.id])),
    s.submitted,
    formatScore(s.total),
    formatScore(report.maxTotal),
  ]);
  return [header, ...body];
}
