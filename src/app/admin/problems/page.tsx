import { Suspense } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/admin/admin-gate";
import { ProblemsBoard, type BoardProblem } from "@/components/admin/problems-board";
import { createClient } from "@/lib/supabase/server";
import { bangkokToday, isIsoDate, shiftDate } from "@/lib/problem-form";

export default function ProblemsPage({ searchParams }: PageProps<"/admin/problems">) {
  return (
    <Suspense fallback={<p className="p-6 text-foreground/60">กำลังโหลด…</p>}>
      <AdminGate>
        <Daily searchParams={searchParams} />
      </AdminGate>
    </Suspense>
  );
}

type StatusRow = { is_open: boolean; submission_count: number; opened_at: string | null };

/** มุมมองรายวัน: โจทย์ที่เปิดครั้งแรกในวันที่เลือก (Asia/Bangkok) + โจทย์ที่ยังไม่เคยเปิด */
async function Daily({ searchParams }: { searchParams: PageProps<"/admin/problems">["searchParams"] }) {
  const supabase = await createClient(); // ต้องมาก่อน new Date() (อ่านตอน request)
  const { date } = await searchParams;
  const today = bangkokToday();
  const day = isIsoDate(date) ? date : today;

  const [{ data: daily }, { data: drafts }] = await Promise.all([
    supabase
      .from("v_daily_problem_summary")
      .select("problem_id, title, is_open, submission_count, opened_at")
      .eq("day", day)
      .order("opened_at"),
    supabase
      .from("problems")
      .select("id, title, created_at, problem_status!inner(is_open, submission_count, opened_at)")
      .is("problem_status.opened_at", null)
      .order("created_at", { ascending: false })
      .overrideTypes<{ id: number; title: string; created_at: string; problem_status: StatusRow }[], { merge: false }>(),
  ]);

  const dayProblems: BoardProblem[] = (daily ?? []).map((p) => ({
    id: p.problem_id,
    title: p.title,
    is_open: p.is_open,
    submission_count: p.submission_count,
    opened_at: p.opened_at,
  }));
  const draftProblems: BoardProblem[] = (drafts ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    is_open: p.problem_status.is_open,
    submission_count: p.problem_status.submission_count,
    opened_at: null,
  }));

  const dayLabel = new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">โจทย์</h1>
          <p className="text-sm text-foreground/60" data-testid="day-label">
            {dayLabel}
            {day === today && " (วันนี้)"}
          </p>
        </div>
        <Link href="/admin/problems/new" className="btn btn-primary">
          สร้างโจทย์ใหม่
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/admin/problems">
        <Link href={`/admin/problems?date=${shiftDate(day, -1)}`} className="btn btn-secondary" aria-label="วันก่อนหน้า">
          ‹
        </Link>
        <label className="field">
          <span>วันที่ (เปิดโจทย์ครั้งแรก)</span>
          <input type="date" name="date" defaultValue={day} className="input" />
        </label>
        <button type="submit" className="btn btn-secondary">
          ดู
        </button>
        <Link href={`/admin/problems?date=${shiftDate(day, 1)}`} className="btn btn-secondary" aria-label="วันถัดไป">
          ›
        </Link>
        {day !== today && (
          <Link href="/admin/problems" className="btn btn-secondary">
            วันนี้
          </Link>
        )}
      </form>

      <ProblemsBoard day={dayProblems} drafts={draftProblems} />
    </div>
  );
}
