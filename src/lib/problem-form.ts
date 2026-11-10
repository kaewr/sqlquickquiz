/** ข้อมูลฟอร์มโจทย์ (ตรงกับคอลัมน์ problems + problem_solutions.reference_sql) */
export type ProblemInput = {
  title: string;
  description: string;
  schema_info: string;
  expected_example: string;
  max_score: string; // เก็บเป็นข้อความในฟอร์ม แปลงตอนบันทึก
  order_matters: boolean;
  dataset_name: string;
  reference_sql: string;
};

export type ProblemFormState = {
  values?: ProblemInput;
  errors?: Partial<Record<keyof ProblemInput, string>>;
  error?: string;
  success?: string;
};

export const EMPTY_PROBLEM: ProblemInput = {
  title: "",
  description: "",
  schema_info: "",
  expected_example: "",
  max_score: "10",
  order_matters: false,
  dataset_name: "",
  reference_sql: "",
};

export function readProblemForm(formData: FormData): ProblemInput {
  const text = (name: string) => String(formData.get(name) ?? "");
  return {
    title: text("title").trim(),
    description: text("description"),
    schema_info: text("schema_info"),
    expected_example: text("expected_example"),
    max_score: text("max_score").trim(),
    order_matters: formData.get("order_matters") === "on",
    dataset_name: text("dataset_name").trim(),
    reference_sql: text("reference_sql"),
  };
}

/** ตรวจตามข้อจำกัดของฐานข้อมูล (ชื่อไม่ว่าง ≤ 200, คะแนนเต็ม > 0 และ ≤ 9999.99 ทศนิยม ≤ 2 ตำแหน่ง) */
export function validateProblem(input: ProblemInput): ProblemFormState["errors"] {
  const errors: ProblemFormState["errors"] = {};
  if (!input.title) errors.title = "กรุณาใส่ชื่อโจทย์";
  else if (input.title.length > 200) errors.title = "ชื่อโจทย์ยาวได้ไม่เกิน 200 ตัวอักษร";
  const score = Number(input.max_score);
  if (!/^\d+(\.\d{1,2})?$/.test(input.max_score) || !(score > 0) || score > 9999.99) {
    errors.max_score = "คะแนนเต็มต้องเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)";
  }
  return Object.keys(errors).length ? errors : undefined;
}

/** วันที่วันนี้ตามเวลากรุงเทพ YYYY-MM-DD */
export function bangkokToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
