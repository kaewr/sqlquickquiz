"use client";

import { useActionState, useEffect, useState } from "react";
import { studentLogin, type FormState } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";

/** รอนานกว่านี้ = น่าจะโดนเพดานล็อกอินและ server กำลังลองใหม่ให้ */
const QUEUE_HINT_MS = 2000;

export function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(studentLogin, {});
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSlow(true), QUEUE_HINT_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [pending]);

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-12">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="card w-full max-w-sm border-t-4 border-t-accent">
        <h1 className="text-center text-2xl font-bold text-primary">SQL Quick Quiz</h1>
        <p className="mt-1 text-center text-sm text-foreground/60">เข้าสู่ระบบสำหรับนิสิต</p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <label className="field">
            <span>รหัสนิสิต</span>
            <input
              name="student_id"
              inputMode="numeric"
              autoComplete="username"
              maxLength={8}
              placeholder="เช่น 65012345"
              required
              className="input"
            />
          </label>
          <label className="field">
            <span>รหัสผ่าน</span>
            <input name="password" type="password" autoComplete="current-password" required className="input" />
          </label>

          {state.error && (
            <p role="alert" className="alert alert-error">
              {state.error}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
          {pending && slow && (
            <p role="status" data-testid="login-queue" className="text-center text-sm text-foreground/60">
              มีผู้เข้าระบบพร้อมกันจำนวนมาก กำลังรอคิว ไม่ต้องกดซ้ำ…
            </p>
          )}
        </form>

        <p className="mt-4 text-center text-sm text-foreground/60">
          ลืมรหัสผ่าน? ติดต่ออาจารย์เพื่อรีเซ็ตรหัสผ่าน
        </p>
      </div>
    </main>
  );
}
