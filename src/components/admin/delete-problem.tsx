"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteProblem } from "@/app/actions/problems";

type Impact = { submissions: number; results: number; isOpen: boolean; released: boolean };

/**
 * ลบโจทย์ถาวร (แม้มีคนส่งแล้ว)
 * - เปิดหน้าต่างแล้วดึงจำนวนคำตอบ/คะแนนล่าสุดมาแจ้ง
 * - ต้องพิมพ์ชื่อโจทย์ให้ตรงก่อนกดยืนยันได้ (ฐานข้อมูลตรวจซ้ำ)
 */
export function DeleteProblem({ problemId, title }: { problemId: number; title: string }) {
  const supabase = useMemo(() => createClient(), []);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  async function open() {
    setTyped("");
    setError("");
    setImpact(null);
    dialogRef.current?.showModal();
    const [subs, results, status, problem] = await Promise.all([
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("problem_id", problemId),
      supabase
        .from("results")
        .select("id, submissions!inner(problem_id)", { count: "exact", head: true })
        .eq("submissions.problem_id", problemId),
      supabase.from("problem_status").select("is_open").eq("problem_id", problemId).maybeSingle(),
      supabase.from("problems").select("results_released_at").eq("id", problemId).maybeSingle(),
    ]);
    setImpact({
      submissions: subs.count ?? 0,
      results: results.count ?? 0,
      isOpen: status.data?.is_open ?? false,
      released: !!problem.data?.results_released_at,
    });
  }

  const matches = typed === title;

  return (
    <section className="rounded-xl border border-danger/40 p-5" aria-labelledby="danger-heading">
      <h2 id="danger-heading" className="font-semibold text-danger">
        ลบโจทย์
      </h2>
      <p className="mt-1 text-sm text-foreground/70">
        ลบโจทย์นี้ถาวร รวมถึงคำตอบและคะแนนของนิสิตทุกคนในข้อนี้ ใช้สำหรับล้างข้อทดลองหรือข้อที่สร้างผิด
      </p>
      <button type="button" className="btn btn-danger mt-3" onClick={open}>
        ลบโจทย์นี้…
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-title"
        className="m-auto w-[min(30rem,calc(100%-2rem))] rounded-xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches) return;
            start(async () => {
              const res = await deleteProblem(problemId, typed);
              if (res?.error) setError(res.error); // สำเร็จ = redirect
            });
          }}
        >
          <h3 id="delete-title" className="text-lg font-semibold text-danger">
            ⚠️ ลบโจทย์ถาวร
          </h3>

          {impact ? (
            <div role="alert" className="alert alert-error flex flex-col gap-1" data-testid="delete-impact">
              <p className="font-semibold">กู้คืนไม่ได้</p>
              <p>
                คำตอบของนิสิต <strong data-testid="impact-submissions">{impact.submissions}</strong> คน และคะแนน{" "}
                <strong data-testid="impact-results">{impact.results}</strong> รายการ จะถูกลบไปด้วย
              </p>
              {impact.isOpen && <p>ข้อนี้เปิดรับคำตอบอยู่ — นิสิตที่กำลังทำจะเห็นว่าปิดรับคำตอบทันที</p>}
              {impact.released && <p>ข้อนี้ประกาศผลแล้ว — ลิงก์หน้าอันดับจะใช้ไม่ได้</p>}
            </div>
          ) : (
            <p className="text-sm text-foreground/60">กำลังตรวจข้อมูลที่จะถูกลบ…</p>
          )}

          <label className="field">
            <span>
              พิมพ์ชื่อโจทย์ <strong className="select-all font-semibold">{title}</strong> เพื่อยืนยัน
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="input"
              aria-label="พิมพ์ชื่อโจทย์เพื่อยืนยัน"
            />
          </label>

          {error && (
            <p role="alert" className="alert alert-error">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()} disabled={pending}>
              ยกเลิก
            </button>
            <button type="submit" className="btn bg-danger text-white hover:opacity-90" disabled={!matches || !impact || pending}>
              {pending ? "กำลังลบ…" : "ลบถาวร"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
