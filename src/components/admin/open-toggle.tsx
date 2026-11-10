"use client";

import { useState, useTransition } from "react";
import { setProblemOpen } from "@/app/actions/problems";

/** ปุ่มเปิด/ปิดรับคำตอบ — เรียก onChanged หลังสำเร็จ (สถานะจริงมาจาก broadcast / ดึงใหม่) */
export function OpenToggle({
  problemId,
  isOpen,
  onChanged,
  size = "sm",
}: {
  problemId: number;
  isOpen: boolean;
  onChanged?: (open: boolean) => void;
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
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
