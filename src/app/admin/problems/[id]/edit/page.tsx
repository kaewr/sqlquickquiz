import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminGate } from "@/components/admin/admin-gate";
import { ProblemForm } from "@/components/admin/problem-form";
import { updateProblem } from "@/app/actions/problems";
import { getAdminProblem, parseId, toFormInput } from "@/lib/admin-problems";

export default function EditProblemPage({ params }: PageProps<"/admin/problems/[id]/edit">) {
  return (
    <Suspense fallback={<p className="p-6 text-foreground/60">กำลังโหลด…</p>}>
      <AdminGate>
        <EditProblem params={params} />
      </AdminGate>
    </Suspense>
  );
}

async function EditProblem({ params }: { params: PageProps<"/admin/problems/[id]/edit">["params"] }) {
  const { id } = await params;
  const problem = await getAdminProblem(parseId(id));
  if (!problem) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-xl font-semibold">แก้ไขโจทย์</h1>
      <ProblemForm
        action={updateProblem.bind(null, problem.id)}
        initial={toFormInput(problem)}
        submitLabel="บันทึกการแก้ไข"
        cancelHref={`/admin/problems/${problem.id}`}
        submissionCount={problem.submission_count}
      />
    </div>
  );
}
