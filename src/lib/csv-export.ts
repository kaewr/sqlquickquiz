/**
 * สร้าง CSV สำหรับ Excel: UTF-8 BOM + CRLF, ครอบค่าที่มี , " หรือขึ้นบรรทัดด้วย "…"
 * ข้อความที่ขึ้นต้นด้วย = + - @ tab หรือ CR ใส่ ' นำหน้า กัน Excel ตีความเป็นสูตร
 * (เช่น SQL ที่นิสิตส่งมา) — ตัวเลขจริง (number) ไม่ถูกแตะ
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** ชื่อไฟล์ตามเวลากรุงเทพ เช่น report-20261110-1405 */
export function bangkokStamp(now = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}
