import { Suspense } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/admin/admin-gate";
import { ProblemsBoard, type BoardProblem } from "@/components/admin/problems-board";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/problem-form";
import { problemNumbers } from "@/lib/problem-numbers";

export default function ProblemsPage({ searchParams }: PageProps<"/admin/problems">) {
  return (
    <Suspense fallback={<p className="p-6 text-foreground/60">กำลังโหลด…</p>}>
      <AdminGate>
        <AllProblems searchParams={searchParams} />
      </AdminGate>
    </Suspense>
  );
}

type StatusRow = { is_open: boolean; submission_count: number; opened_at: string | null };

/** โจทย์ทั้งหมด (กรองช่วงวันที่เปิดครั้งแรกได้, เวลากรุงเทพ) + โจทย์ที่ยังไม่เคยเปิด */
async function AllProblems({ searchParams }: { searchParams: PageProps<"/admin/problems">["searchParams"] }) {
  const supabase = await createClient();
  const { from: rawFrom, to: rawTo, deleted } = await searchParams;
  const from = isIsoDate(rawFrom) ? rawFrom : null;
  const to = isIsoDate(rawTo) ? rawTo : null;

  let openedQuery = supabase
    .from("v_daily_problem_summary")
    .select("problem_id, title, is_open, submission_count, opened_at, day, results_released")
    .order("opened_at", { ascending: false })
    .range(0, 4999);
  if (from) openedQuery = openedQuery.gte("day", from);
  if (to) openedQuery = openedQuery.lte("day", to);

  const [{ data: opened }, { data: drafts }, numbers] = await Promise.all([
    openedQuery,
    supabase
      .from("problems")
      .select("id, title, created_at, problem_status!inner(is_open, submission_count, opened_at)")
      .is("problem_status.opened_at", null)
      .order("created_at", { ascending: false })
      .overrideTypes<{ id: number; title: string; created_at: string; problem_status: StatusRow }[], { merge: false }>(),
    problemNumbers(supabase),
  ]);

  const openedProblems: BoardProblem[] = (opened ?? []).map((p) => ({
    id: p.problem_id,
    number: numbers.get(p.problem_id) ?? null,
    title: p.title,
    is_open: p.is_open,
    submission_count: p.submission_count,
    opened_at: p.opened_at,
    released: p.results_released,
  }));
  const draftProblems: BoardProblem[] = (drafts ?? []).map((p) => ({
    id: p.id,
    number: null,
    title: p.title,
    is_open: p.problem_status.is_open,
    submission_count: p.problem_status.submission_count,
    opened_at: null,
  }));
  const filtered = Boolean(from || to);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">โจทย์</h1>
          <p className="text-sm text-foreground/60" data-testid="range-label">
            {filtered ? `วันที่เปิด ${from ? thaiDate(from) : "แรกสุด"} – ${to ? thaiDate(to) : "ล่าสุด"}` : "ทั้งหมด"}
          </p>
        </div>
        <Link href="/admin/problems/new" className="btn btn-primary">
          สร้างโจทย์ใหม่
        </Link>
      </div>

      {typeof deleted === "string" && (
        <p role="status" className="alert alert-success" data-testid="deleted-notice">
          ลบโจทย์ “{deleted}” แล้ว
        </p>
      )}

      <form className="flex flex-wrap items-end gap-3" action="/admin/problems">
        <label className="field">
          <span>ตั้งแต่วันที่</span>
          <input type="date" name="from" defaultValue={from ?? ""} className="input" />
        </label>
        <label className="field">
          <span>ถึงวันที่</span>
          <input type="date" name="to" defaultValue={to ?? ""} className="input" />
        </label>
        <button type="submit" className="btn btn-secondary">
          แสดง
        </button>
        {filtered && (
          <Link href="/admin/problems" className="btn btn-secondary">
            ล้างตัวกรอง
          </Link>
        )}
      </form>
      <p className="-mt-4 text-xs text-foreground/60">
        วันที่ = วันที่เปิดโจทย์ครั้งแรก (เวลากรุงเทพ) · หมายเลขข้อเรียงตามเวลาเปิดครั้งแรก
      </p>

      <ProblemsBoard opened={openedProblems} drafts={draftProblems} filtered={filtered} />
    </div>
  );
}

function thaiDate(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
