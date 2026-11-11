"use client";

import { useState, useTransition } from "react";
import { setProblemOpen } from "@/app/actions/problems";

/** ปุ่มเปิด/ปิดรับคำตอบ — เรียก onChanged หลังสำเร็จ (สถานะจริงมาจาก broadcast / ดึงใหม่)
 *  ข้อที่ประกาศผลแล้วเปิดอีกไม่ได้ (ฐานข้อมูลบังคับ PROBLEM_RELEASED) จึงไม่แสดงปุ่มเปิด */
export function OpenToggle({
  problemId,
  isOpen,
  onChanged,
  size = "sm",
  released = false,
}: {
  problemId: number;
  isOpen: boolean;
  onChanged?: (open: boolean) => void;
  size?: "sm" | "md";
  released?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (released && !isOpen) {
    return (
      <span className="text-xs text-foreground/60" title="ประกาศผลแล้ว ต้องการให้ส่งเพิ่มให้คัดลอกโจทย์เป็นข้อใหม่" data-testid="open-locked">
        เปิดอีกไม่ได้
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className={`btn ${size === "sm" ? "btn-sm" : ""} ${isOpen ? "btn-danger" : "btn-primary"}`}
        onClick={() =>
          start(async () => {
            const res = await setProblemOpen(problemId, !isOpen);
            setError(res.error ?? "");
            if (!res.error) onChanged?.(!isOpen);
          })
        }
      >
        {pending ? "กำลังบันทึก…" : isOpen ? "ปิดรับคำตอบ" : "เปิดรับคำตอบ"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
