"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CsvImport } from "@/components/admin/csv-import";
import { thaiError } from "@/lib/errors";

export type StudentListItem = {
  user_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  section: string;
  password_changed: boolean;
  is_active: boolean;
  submission_count: number;
};

type Action = "reset" | "deactivate" | "activate" | "delete";

const CONFIRM: Record<Action, (s: StudentListItem) => string> = {
  reset: (s) => `รีเซ็ตรหัสผ่านของ ${s.student_id} กลับเป็นรหัสนิสิต?`,
  deactivate: (s) => `ปิดบัญชี ${s.student_id}? นิสิตจะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดคืน`,
  activate: (s) => `เปิดบัญชี ${s.student_id} คืน?`,
  delete: (s) => `ลบบัญชี ${s.student_id} ถาวร?`,
};

export function StudentsManager({ students }: { students: StudentListItem[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [pending, setPending] = useState<{ action: Action; student: StudentListItem } | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, startTransition] = useTransition();

  const sections = useMemo(
    () => [...new Set(students.map((s) => s.section))].sort((a, b) => a.localeCompare(b, "th")),
    [students],
  );
  const filtered = students.filter((s) => {
    if (section && s.section !== section) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${s.student_id} ${s.first_name} ${s.last_name}`.toLowerCase().includes(q);
  });

  function run(action: Action, student: StudentListItem) {
    startTransition(async () => {
      const base = `/api/admin/students/${student.user_id}`;
      const res =
        action === "delete"
          ? await fetch(base, { method: "DELETE" })
          : action === "reset"
            ? await fetch(`${base}/reset-password`, { method: "POST" })
            : await fetch(`${base}/active`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ active: action === "activate" }),
              });
      const body = await res.json().catch(() => ({}));
      setPending(null);
      if (!res.ok) {
        setMessage({ kind: "error", text: thaiError(body.error) });
        return;
      }
      const done: Record<Action, string> = {
        reset: `รีเซ็ตรหัสผ่านของ ${student.student_id} แล้ว (รหัสผ่าน = รหัสนิสิต)`,
        deactivate: `ปิดบัญชี ${student.student_id} แล้ว`,
        activate: `เปิดบัญชี ${student.student_id} แล้ว`,
        delete: `ลบบัญชี ${student.student_id} แล้ว`,
      };
      setMessage({ kind: "success", text: done[action] });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">นิสิต</h1>
          <p className="text-sm text-foreground/60">ทั้งหมด {students.length} คน</p>
        </div>
      </div>

      <CsvImport onImported={() => router.refresh()} />

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`alert alert-${message.kind}`}>
          {message.text}
        </p>
      )}

      {pending && (
        <div role="alertdialog" aria-labelledby="confirm-text" className="card flex flex-wrap items-center justify-between gap-3">
          <p id="confirm-text">{CONFIRM[pending.action](pending.student)}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>
              ยกเลิก
            </button>
            <button
              type="button"
              className={pending.action === "delete" || pending.action === "deactivate" ? "btn btn-danger" : "btn btn-primary"}
              onClick={() => run(pending.action, pending.student)}
              disabled={busy}
            >
              {busy ? "กำลังทำ…" : "ยืนยัน"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="ค้นหารหัส / ชื่อ"
          aria-label="ค้นหารหัสหรือชื่อ"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input max-w-xs"
        />
        <select
          aria-label="ตอนเรียน"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="input w-auto"
        >
          <option value="">ทุกตอนเรียน</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              ตอน {s}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">รหัสนิสิต</th>
              <th className="px-3 py-2">ชื่อ - นามสกุล</th>
              <th className="px-3 py-2">ตอน</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.user_id} className="border-t border-border" data-testid={`student-row-${s.student_id}`}>
                <td className="px-3 py-2 font-mono">{s.student_id}</td>
                <td className="px-3 py-2">
                  {s.first_name} {s.last_name}
                </td>
                <td className="px-3 py-2">{s.section}</td>
                <td className="px-3 py-2">
                  <span className={s.is_active ? "" : "text-danger"}>{s.is_active ? "ใช้งาน" : "ปิดบัญชี"}</span>
                  {!s.password_changed && <span className="ml-2 text-foreground/50">· รหัสเริ่มต้น</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPending({ action: "reset", student: s })}>
                      รีเซ็ตรหัส
                    </button>
                    {s.is_active ? (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => setPending({ action: "deactivate", student: s })}>
                        ปิดบัญชี
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPending({ action: "activate", student: s })}>
                        เปิดบัญชี
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={s.submission_count > 0}
                      title={s.submission_count > 0 ? thaiError("STUDENT_HAS_SUBMISSIONS") : undefined}
                      onClick={() => setPending({ action: "delete", student: s })}
                    >
                      ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-foreground/60">
                  ไม่พบนิสิต
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
