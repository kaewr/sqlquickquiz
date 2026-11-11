"use client";

import { useSyncExternalStore } from "react";

/**
 * สลับโหมดสว่าง/มืด — ค่าเริ่มต้นสว่าง (ไม่ตามเครื่อง), จำค่าในเบราว์เซอร์ (localStorage "theme")
 * โหมดที่จำไว้ถูกตั้งก่อนหน้าเว็บแสดงด้วยสคริปต์ใน app/layout.tsx (ไม่กะพริบ)
 */
export const THEME_KEY = "theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const getTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as const);
  const dark = theme === "dark";

  function toggle() {
    const next = dark ? "light" : "dark";
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // โหมดส่วนตัว/ปิด storage: ใช้ได้เฉพาะหน้านี้
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-secondary btn-sm ${className}`}
      aria-pressed={dark}
      aria-label={dark ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
      title={dark ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
      data-testid="theme-toggle"
    >
      <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
    </button>
  );
}
