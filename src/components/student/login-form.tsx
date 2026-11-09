"use client";

import { useActionState } from "react";
import { studentLogin, type FormState } from "@/app/actions/auth";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(studentLogin, {});

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="card w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold">SQL Quick Quiz</h1>
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
        </form>

        <p className="mt-4 text-center text-sm text-foreground/60">
          ลืมรหัสผ่าน? ติดต่ออาจารย์เพื่อรีเซ็ตรหัสผ่าน
        </p>
      </div>
    </main>
  );
}
