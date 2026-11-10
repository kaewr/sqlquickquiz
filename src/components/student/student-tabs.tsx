"use client";

import { useState } from "react";
import { StudentHistory } from "@/components/student/student-history";

/** แท็บหน้านิสิต: โจทย์ปัจจุบัน / ประวัติของฉัน */
export function StudentTabs({ current }: { current: React.ReactNode }) {
  const [active, setActive] = useState<"current" | "history">("current");
  const tabs = [
    { id: "current" as const, label: "โจทย์ปัจจุบัน" },
    { id: "history" as const, label: "ประวัติของฉัน" },
  ];

  return (
    <div>
      <div role="tablist" className="grid grid-cols-2 rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              active === t.id ? "bg-background shadow-sm" : "text-foreground/60 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* ซ่อนด้วย hidden แทนการถอดออก — realtime ของแท็บโจทย์ทำงานต่อ และ SQL ที่พิมพ์ค้างไม่หาย */}
      <div role="tabpanel" id="panel-current" aria-labelledby="tab-current" hidden={active !== "current"} className="mt-4">
        {current}
      </div>
      <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" hidden={active !== "history"} className="mt-4">
        <StudentHistory active={active === "history"} />
      </div>
    </div>
  );
}
