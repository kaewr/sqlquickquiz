import { isValidStudentId } from "@/lib/student-id";

/** แถวรายชื่อนิสิตจาก CSV: student_id, first_name, last_name, section */
export type StudentRow = {
  line: number;
  student_id: string;
  first_name: string;
  last_name: string;
  section: string;
};

export type RowError = { line: number; student_id: string; message: string };

export const CSV_HEADER = ["student_id", "first_name", "last_name", "section"] as const;

/** แยก CSV ทีละบรรทัด รองรับ "ค่าในเครื่องหมายคำพูด", "" และจุลภาคในค่า */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** ตรวจแถวรายชื่อ: ช่องว่าง, รูปแบบรหัส, รหัสซ้ำในไฟล์ */
export function validateRows(rows: StudentRow[]): { valid: StudentRow[]; errors: RowError[] } {
  const valid: StudentRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();

  for (const r of rows) {
    const row: StudentRow = {
      line: r.line,
      student_id: (r.student_id ?? "").trim(),
      first_name: (r.first_name ?? "").trim(),
      last_name: (r.last_name ?? "").trim(),
      section: (r.section ?? "").trim(),
    };
    const problems: string[] = [];
    if (!row.student_id) problems.push("ไม่มีรหัสนิสิต");
    else if (!isValidStudentId(row.student_id)) problems.push("รหัสนิสิตต้องเป็นตัวเลข 8 หลัก");
    if (!row.first_name) problems.push("ไม่มีชื่อ");
    if (!row.last_name) problems.push("ไม่มีนามสกุล");
    if (!row.section) problems.push("ไม่มีตอนเรียน");
    if (row.student_id && seen.has(row.student_id)) {
      problems.push(`รหัสซ้ำกับบรรทัด ${seen.get(row.student_id)}`);
    }
    if (row.student_id && !seen.has(row.student_id)) seen.set(row.student_id, row.line);

    if (problems.length) errors.push({ line: row.line, student_id: row.student_id, message: problems.join(", ") });
    else valid.push(row);
  }
  return { valid, errors };
}

/**
 * อ่านไฟล์ CSV รายชื่อ (UTF-8, ตัด BOM จาก Excel)
 * ต้องมีหัวตาราง student_id, first_name, last_name, section (ลำดับคอลัมน์ใดก็ได้)
 */
export function parseStudentCsv(text: string): {
  valid: StudentRow[];
  errors: RowError[];
  headerError?: string;
} {
  const clean = text.replace(/^﻿/, "");
  // จำเลขบรรทัดจริงก่อนข้ามแถวว่าง
  const table = parseCsv(clean)
    .map((cells, i) => ({ cells, line: i + 1 }))
    .filter(({ cells }) => cells.some((c) => c.trim() !== ""));
  if (table.length === 0) return { valid: [], errors: [], headerError: "ไฟล์ว่าง" };

  const header = table[0].cells.map((h) => h.trim().toLowerCase());
  const index = Object.fromEntries(CSV_HEADER.map((name) => [name, header.indexOf(name)]));
  const missing = CSV_HEADER.filter((name) => index[name] < 0);
  if (missing.length) {
    return {
      valid: [],
      errors: [],
      headerError: `หัวตารางไม่ครบ ต้องมีคอลัมน์: ${CSV_HEADER.join(", ")} (ขาด ${missing.join(", ")})`,
    };
  }

  const rows: StudentRow[] = table.slice(1).map(({ cells, line }) => ({
    line,
    student_id: cells[index.student_id] ?? "",
    first_name: cells[index.first_name] ?? "",
    last_name: cells[index.last_name] ?? "",
    section: cells[index.section] ?? "",
  }));
  return validateRows(rows);
}
