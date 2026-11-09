"use client";

import { useRef, useState, useTransition } from "react";
import { parseStudentCsv, type RowError, type StudentRow } from "@/lib/csv";
import { thaiError } from "@/lib/errors";

type ImportResult = {
  created: number;
  updated: number;
  failed: { student_id: string; message: string }[];
};

/** นำเข้ารายชื่อ: เลือกไฟล์ → ตัวอย่าง + แถวผิด → ยืนยัน → ผลรายแถว */
export function CsvImport({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<{ valid: StudentRow[]; errors: RowError[]; headerError?: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    setResult(null);
    setError("");
    if (!file) return;
    setFileName(file.name);
    const text = await file.text(); // UTF-8; parseStudentCsv ตัด BOM
    setPreview(parseStudentCsv(text));
  }

  function reset() {
    setPreview(null);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function confirmImport() {
    if (!preview?.valid.length) return;
    startTransition(async () => {
      const res = await fetch("/api/admin/students/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: preview.valid }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(thaiError(body.error));
        return;
      }
      setResult(body as ImportResult);
      reset();
      onImported();
    });
  }

  return (
    <section className="card flex flex-col gap-4" aria-labelledby="csv-title">
      <div>
        <h2 id="csv-title" className="font-semibold">
          นำเข้ารายชื่อจาก CSV
        </h2>
        <p className="mt-1 text-sm text-foreground/60">
          หัวตาราง <code className="font-mono">student_id, first_name, last_name, section</code> · UTF-8 (บันทึกจาก Excel แบบ
          “CSV UTF-8” ได้) · รหัสใหม่จะสร้างบัญชีโดยรหัสผ่านเริ่มต้น = รหัสนิสิต · รหัสที่มีอยู่แล้วจะอัปเดตชื่อและตอนเรียน
        </p>
      </div>

      <label className="field max-w-md">
        <span>เลือกไฟล์ CSV</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="input"
          data-testid="csv-file"
        />
      </label>

      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}

      {preview?.headerError && (
        <p role="alert" className="alert alert-error">
          {preview.headerError}
        </p>
      )}

      {preview && !preview.headerError && (
        <div className="flex flex-col gap-3" data-testid="csv-preview">
          <p className="text-sm">
            ไฟล์ <span className="font-medium">{fileName}</span>: พร้อมนำเข้า{" "}
            <strong data-testid="csv-valid-count">{preview.valid.length}</strong> แถว · ผิด{" "}
            <strong data-testid="csv-error-count" className={preview.errors.length ? "text-danger" : ""}>
              {preview.errors.length}
            </strong>{" "}
            แถว (แถวที่ผิดจะไม่ถูกนำเข้า)
          </p>

          {preview.errors.length > 0 && (
            <ul className="alert alert-error list-inside list-disc" data-testid="csv-errors">
              {preview.errors.map((e) => (
                <li key={e.line}>
                  บรรทัด {e.line}
                  {e.student_id && ` (${e.student_id})`}: {e.message}
                </li>
              ))}
            </ul>
          )}

          {preview.valid.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="px-3 py-1.5">บรรทัด</th>
                    <th className="px-3 py-1.5">รหัสนิสิต</th>
                    <th className="px-3 py-1.5">ชื่อ</th>
                    <th className="px-3 py-1.5">นามสกุล</th>
                    <th className="px-3 py-1.5">ตอน</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.valid.map((r) => (
                    <tr key={r.line} className="border-t border-border">
                      <td className="px-3 py-1.5 text-foreground/50">{r.line}</td>
                      <td className="px-3 py-1.5 font-mono">{r.student_id}</td>
                      <td className="px-3 py-1.5">{r.first_name}</td>
                      <td className="px-3 py-1.5">{r.last_name}</td>
                      <td className="px-3 py-1.5">{r.section}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" disabled={busy || preview.valid.length === 0} onClick={confirmImport}>
              {busy ? "กำลังนำเข้า…" : `ยืนยันนำเข้า ${preview.valid.length} แถว`}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={reset}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {result && (
        <div role="status" className="alert alert-success" data-testid="csv-result">
          นำเข้าเสร็จ: สร้างใหม่ {result.created} คน · อัปเดต {result.updated} คน
          {result.failed.length > 0 && ` · ไม่สำเร็จ ${result.failed.length} คน`}
          {result.failed.length > 0 && (
            <ul className="mt-1 list-inside list-disc">
              {result.failed.map((f) => (
                <li key={f.student_id}>
                  {f.student_id}: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
