"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword, logout, type FormState } from "@/app/actions/auth";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="btn btn-secondary"
      >
        บัญชี
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-border bg-background p-1 shadow-lg">
          <button
            role="menuitem"
            type="button"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              dialogRef.current?.showModal();
            }}
          >
            เปลี่ยนรหัสผ่าน
          </button>
          <form action={logout}>
            <button role="menuitem" type="submit" className="menu-item">
              ออกจากระบบ
            </button>
          </form>
        </div>
      )}
      <ChangePasswordDialog dialogRef={dialogRef} />
    </div>
  );
}

function ChangePasswordDialog({ dialogRef }: { dialogRef: React.RefObject<HTMLDialogElement | null> }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FormState, FormData>(changePassword, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      router.refresh(); // ซ่อนแถบเตือนทันที
    }
  }, [state, router]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="change-password-title"
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border border-border bg-background p-0 text-foreground backdrop:bg-black/40"
    >
      <form ref={formRef} action={formAction} className="flex flex-col gap-4 p-5">
        <h2 id="change-password-title" className="text-lg font-semibold">
          เปลี่ยนรหัสผ่าน
        </h2>
        <label className="field">
          <span>รหัสผ่านเดิม</span>
          <input name="old_password" type="password" autoComplete="current-password" required className="input" />
        </label>
        <label className="field">
          <span>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</span>
          <input name="new_password" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </label>
        <label className="field">
          <span>ยืนยันรหัสผ่านใหม่</span>
          <input name="confirm_password" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </label>

        {state.error && (
          <p role="alert" className="alert alert-error">
            {state.error}
          </p>
        )}
        {state.success && (
          <p role="status" className="alert alert-success">
            {state.success}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
            ปิด
          </button>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
