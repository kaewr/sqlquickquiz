"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import type { ProblemFormState, ProblemInput } from "@/lib/problem-form";

type Action = (prev: ProblemFormState, formData: FormData) => Promise<ProblemFormState>;

export function ProblemForm({
  action,
  initial,
  submitLabel,
  cancelHref,
  submissionCount = 0,
}: {
  action: Action;
  initial: ProblemInput;
  submitLabel: string;
  cancelHref: string;
  submissionCount?: number;
}) {
  const [state, formAction, pending] = useActionState<ProblemFormState, FormData>(action, { values: initial });
  const v = state.values ?? initial;
  const errors = state.errors ?? {};
  const [referenceSql, setReferenceSql] = useState(v.reference_sql);

  return (
    // key: หลัง action คืนค่า ให้ฟอร์มรับค่าที่กรอกล่าสุด (defaultValue)
    <form action={formAction} className="flex flex-col gap-5" key={JSON.stringify(state.values)} noValidate>
      {submissionCount > 0 && (
        <p role="status" className="alert border border-warning-border bg-warning-bg text-warning-fg">
          โจทย์นี้มีคนส่งแล้ว {submissionCount} คน — การแก้ไขจะแสดงให้นิสิตเห็นทันที คำตอบที่ส่งไปแล้วไม่เปลี่ยน
        </p>
      )}
      {state.error && (
        <p role="alert" className="alert alert-error">
          {state.error}
        </p>
      )}

      <Field label="ชื่อโจทย์" error={errors.title} htmlFor="title">
        <input id="title" name="title" defaultValue={v.title} maxLength={200} className="input" aria-invalid={!!errors.title} />
      </Field>

      <MarkdownField name="description" label="คำอธิบาย (markdown)" initial={v.description} rows={5} />
      <MarkdownField name="schema_info" label="โครงสร้างตาราง (markdown)" initial={v.schema_info} rows={4} />
      <MarkdownField name="expected_example" label="ตัวอย่างผลลัพธ์ (markdown — ตารางใช้ | คอลัมน์ |)" initial={v.expected_example} rows={5} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="คะแนนเต็ม" error={errors.max_score} htmlFor="max_score">
          <input
            id="max_score"
            name="max_score"
            defaultValue={v.max_score}
            inputMode="decimal"
            className="input"
            aria-invalid={!!errors.max_score}
          />
        </Field>
        <Field label="dataset_name (ชุดข้อมูลสำหรับตรวจอัตโนมัติ)" htmlFor="dataset_name">
          <input id="dataset_name" name="dataset_name" defaultValue={v.dataset_name} placeholder="เช่น world" className="input" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium">
          <input type="checkbox" name="order_matters" defaultChecked={v.order_matters} className="h-4 w-4" />
          ลำดับแถวต้องตรง (บังคับ ORDER BY)
        </label>
      </div>

      <Field label="คำสั่งเฉลย (นิสิตไม่เห็น)" htmlFor="reference_sql">
        <textarea
          id="reference_sql"
          name="reference_sql"
          defaultValue={v.reference_sql}
          onChange={(e) => setReferenceSql(e.target.value)}
          rows={5}
          spellCheck={false}
          className="input font-mono text-sm"
        />
        {referenceSql.trim() === "" && (
          <span className="text-xs font-normal text-warning-fg" data-testid="reference-sql-warning">
            ยังไม่มีคำสั่งเฉลย — ตัวตรวจอัตโนมัติในอนาคตต้องใช้
          </span>
        )}
      </Field>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "กำลังบันทึก…" : submitLabel}
        </button>
        <Link href={cancelHref} className="btn btn-secondary">
          ยกเลิก
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && (
        <span role="alert" className="text-xs font-normal text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

/** ช่อง markdown พร้อมปุ่มสลับ แก้ไข / ตัวอย่าง (ตัวแสดงผลเดียวกับหน้านิสิต) */
function MarkdownField({ name, label, initial, rows }: { name: string; label: string; initial: string; rows: number }) {
  const [value, setValue] = useState(initial);
  const [preview, setPreview] = useState(false);
  return (
    <div className="field">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={name}>{label}</label>
        <div role="group" aria-label={`มุมมอง ${label}`} className="flex rounded-md bg-muted p-0.5 text-xs">
          <button
            type="button"
            aria-pressed={!preview}
            onClick={() => setPreview(false)}
            className={`rounded px-2 py-1 ${!preview ? "bg-background shadow-sm" : ""}`}
          >
            แก้ไข
          </button>
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview(true)}
            className={`rounded px-2 py-1 ${preview ? "bg-background shadow-sm" : ""}`}
          >
            ตัวอย่าง
          </button>
        </div>
      </div>
      {/* textarea อยู่ตลอดเพื่อส่งค่าในฟอร์ม — ซ่อนตอนดูตัวอย่าง */}
      <textarea
        id={name}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={rows}
        hidden={preview}
        className="input font-mono text-sm"
      />
      {preview && (
        <div className="min-h-16 rounded-lg border border-border p-3 font-normal" data-testid={`preview-${name}`}>
          {value.trim() ? <Markdown>{value}</Markdown> : <span className="text-foreground/50">(ว่าง)</span>}
        </div>
      )}
    </div>
  );
}
