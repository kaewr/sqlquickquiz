/** รหัสนิสิต: ตัวเลข 8 หลัก (ตรงกับ constraint ในฐานข้อมูล) */
export const STUDENT_ID_PATTERN = /^[0-9]{8}$/;

export function isValidStudentId(value: string): boolean {
  return STUDENT_ID_PATTERN.test(value);
}

/** อีเมลภายในที่ใช้กับ Supabase Auth — นิสิตไม่ต้องรู้ */
export function studentEmail(studentId: string): string {
  return `${studentId}@quiz.local`;
}

export const MIN_PASSWORD_LENGTH = 8;
