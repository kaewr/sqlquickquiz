/** แปลรหัสข้อผิดพลาด (จาก Supabase Auth และจากฐานข้อมูล) เป็นข้อความภาษาไทย */
const MESSAGES: Record<string, string> = {
  // ล็อกอิน / บัญชี
  invalid_credentials: "รหัสนิสิตหรือรหัสผ่านไม่ถูกต้อง",
  user_banned: "บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่ออาจารย์",
  over_request_rate_limit: "มีการเข้าสู่ระบบจำนวนมากเกินไป กรุณารอสักครู่แล้วลองใหม่",
  over_email_send_rate_limit: "มีการเข้าสู่ระบบจำนวนมากเกินไป กรุณารอสักครู่แล้วลองใหม่",
  weak_password: "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร",
  same_password: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม",
  signup_disabled: "บัญชีนี้ไม่มีสิทธิ์เข้าใช้ระบบ",
  INVALID_STUDENT_ID: "รหัสนิสิตต้องเป็นตัวเลข 8 หลัก",
  WRONG_OLD_PASSWORD: "รหัสผ่านเดิมไม่ถูกต้อง",
  PASSWORD_MISMATCH: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน",
  NOT_STUDENT_ACCOUNT: "บัญชีนี้ไม่ใช่บัญชีนิสิต",
  NOT_INSTRUCTOR: "บัญชีนี้ไม่มีสิทธิ์เข้าหน้าอาจารย์",
  UNAUTHENTICATED: "กรุณาเข้าสู่ระบบก่อน",
  OAUTH_FAILED: "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่",
  // จัดการนิสิต
  STUDENT_NOT_FOUND: "ไม่พบนิสิตคนนี้",
  STUDENT_HAS_SUBMISSIONS: "ลบไม่ได้ เพราะนิสิตคนนี้เคยส่งคำตอบแล้ว ให้ปิดบัญชีแทน",
  INVALID_INPUT: "ข้อมูลที่ส่งไม่ถูกต้อง",
  // ส่งคำตอบ (รหัสจาก submit_answer)
  NOT_STUDENT: "บัญชีนี้ส่งคำตอบไม่ได้ (ไม่ใช่นิสิต หรือบัญชีถูกปิด)",
  INVALID_SQL_TEXT: "คำสั่ง SQL ต้องไม่ว่างและยาวไม่เกิน 10,000 ตัวอักษร",
  PROBLEM_CLOSED: "ปิดรับคำตอบแล้ว",
  ALREADY_SUBMITTED: "คุณส่งคำตอบข้อนี้ไปแล้ว ส่งซ้ำไม่ได้",
  // โจทย์
  PROBLEM_NOT_FOUND: "ไม่พบโจทย์ข้อนี้",
  CONFIRM_TITLE_MISMATCH: "ชื่อโจทย์ที่พิมพ์ยืนยันไม่ตรง",
  MAX_SCORE_BELOW_GIVEN: "คะแนนเต็มต่ำกว่าคะแนนที่ให้นิสิตไปแล้ว ให้แก้คะแนนนิสิตก่อน",
  // ปัญหาการตั้งค่าเซิร์ฟเวอร์ (ดู log ใน Vercel)
  SERVER_MISCONFIGURED: "ระบบยังตั้งค่าไม่ครบ: ไม่พบ SUPABASE_SERVICE_ROLE_KEY บนเซิร์ฟเวอร์",
  SERVICE_KEY_REJECTED: "Supabase ปฏิเสธ SUPABASE_SERVICE_ROLE_KEY บนเซิร์ฟเวอร์ (ค่าไม่ถูกต้องหรือเป็นของ project อื่น)",
  DB_ERROR: "บันทึกข้อมูลไม่สำเร็จ (ฐานข้อมูล)",
  AUTH_ERROR: "ระบบบัญชีผู้ใช้ทำงานไม่สำเร็จ",
  SERVER_ERROR: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์",
};

export const GENERIC_ERROR = "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";

export function thaiError(code: string | undefined | null): string {
  return (code && MESSAGES[code]) || GENERIC_ERROR;
}
