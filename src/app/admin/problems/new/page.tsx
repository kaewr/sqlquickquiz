import { Suspense } from "react";
import { AdminGate } from "@/components/admin/admin-gate";
import { ProblemForm } from "@/components/admin/problem-form";
import { createProblem } from "@/app/actions/problems";
import { EMPTY_PROBLEM } from "@/lib/problem-form";
import { getAdminProblem, parseId, toFormInput } from "@/lib/admin-problems";

export default function NewProblemPage({ searchParams }: PageProps<"/admin/problems/new">) {
  return (
    <Suspense fallback={<p className="p-6 text-foreground/60">กำลังโหลด…</p>}>
      <AdminGate>
        <NewProblem searchParams={searchParams} />
      </AdminGate>
    </Suspense>
  );
}

/** สร้างใหม่ หรือคัดลอกจาก ?from=<id> (ทุกช่องรวมเฉลย ชื่อลงท้าย "(สำเนา)" ยังไม่เปิด) */
async function NewProblem({ searchParams }: { searchParams: PageProps<"/admin/problems/new">["searchParams"] }) {
  const { from } = await searchParams;
  const source = typeof from === "string" ? await getAdminProblem(parseId(from)) : null;
  const initial = source ? { ...toFormInput(source), title: `${source.title} (สำเนา)`.slice(0, 200) } : EMPTY_PROBLEM;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{source ? "คัดลอกโจทย์" : "สร้างโจทย์ใหม่"}</h1>
      <p className="mb-5 text-sm text-foreground/60">
        {source ? `คัดลอกจาก “${source.title}” — ` : ""}โจทย์ที่สร้างจะยังไม่เปิด นิสิตยังไม่เห็นจนกว่าจะกดเปิด
      </p>
      <ProblemForm action={createProblem} initial={initial} submitLabel="บันทึกโจทย์" cancelHref="/admin/problems" />
    </div>
  );
}
