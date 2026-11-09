"use client";

import { useState } from "react";

const TABS = [
  { id: "current", label: "โจทย์ปัจจุบัน", empty: "ยังไม่มีโจทย์ที่เปิดอยู่" },
  { id: "history", label: "ประวัติของฉัน", empty: "ยังไม่มีประวัติการส่งคำตอบ" },
] as const;

/** แท็บหน้านิสิต — เนื้อหาจะเพิ่มในระยะที่ 3 (โจทย์ปัจจุบัน) และ 5 (ประวัติ) */
export function StudentTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("current");
  const tab = TABS.find((t) => t.id === active)!;

  return (
    <div>
      <div role="tablist" className="grid grid-cols-2 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
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
      <div role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} className="mt-4">
        <p className="card text-center text-foreground/60">{tab.empty}</p>
      </div>
    </div>
  );
}
