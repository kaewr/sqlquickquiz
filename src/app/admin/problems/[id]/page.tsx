import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminGate } from "@/components/admin/admin-gate";
import { SubmissionsMonitor } from "@/components/admin/submissions-monitor";
import { Markdown } from "@/components/markdown";
import { createClient } from "@/lib/supabase/server";
import { getAdminProblem, parseId } from "@/lib/admin-problems";
import { fetchActiveRoster, fetchSubmissions } from "@/lib/admin-submissions";

export default function ProblemDetailPage({ params }: PageProps<"/admin/problems/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-foreground/60">กำลังโหลด…</p>}>
      <AdminGate>
        <Detail params={params} />
      </AdminGate>
    </Suspense>
  );
}

const dateTime = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });

async function Detail({ params }: { params: PageProps<"/admin/problems/[id]">["params"] }) {
  const { id } = await params;
  const problem = await getAdminProblem(parseId(id));
  if (!problem) notFound();

  const supabase = await createClient();
  const [submissions, roster] = await Promise.all([fetchSubmissions(supabase, problem.id), fetchActiveRoster(supabase)]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/problems" className="text-sm text-foreground/60 hover:underline">
            ‹ โจทย์ทั้งหมด
          </Link>
          <h1 className="text-xl font-semibold">{problem.title}</h1>
          <p className="text-sm text-foreground/60">
            คะแนนเต็ม {problem.max_score}
            {problem.order_matters && " · ลำดับแถวต้องตรง"}
            {problem.dataset_name && ` · dataset: ${problem.dataset_name}`}
            {" · "}
            {problem.opened_at ? `เปิดครั้งแรก ${dateTime.format(new Date(problem.opened_at))} น.` : "ยังไม่เคยเปิด"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/problems/${problem.id}/edit`} className="btn btn-secondary">
            แก้ไข
          </Link>
          <Link href={`/admin/problems/new?from=${problem.id}`} className="btn btn-secondary">
            คัดลอก
          </Link>
        </div>
      </div>

      <details className="card">
        <summary className="cursor-pointer font-medium">ดูโจทย์และเฉลย</summary>
        <div className="mt-4 flex flex-col gap-4">
          {problem.description && <Markdown>{problem.description}</Markdown>}
          {problem.schema_info && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">โครงสร้างตาราง</h3>
              <Markdown>{problem.schema_info}</Markdown>
            </section>
          )}
          {problem.expected_example && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">ตัวอย่างผลลัพธ์</h3>
              <Markdown>{problem.expected_example}</Markdown>
            </section>
          )}
          <section>
            <h3 className="mb-1 text-sm font-semibold">คำสั่งเฉลย</h3>
            {problem.reference_sql.trim() ? (
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm">{problem.reference_sql}</pre>
            ) : (
              <p className="text-sm text-warning-fg">ยังไม่มีคำสั่งเฉลย</p>
            )}
          </section>
        </div>
      </details>

      <SubmissionsMonitor
        problemId={problem.id}
        initialOpen={problem.is_open}
        initialSubmissions={submissions}
        roster={roster}
      />
    </div>
  );
}
