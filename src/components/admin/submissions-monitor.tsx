"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBroadcast } from "@/lib/use-broadcast";
import { OpenToggle } from "@/components/admin/open-toggle";
import { SubmissionRows } from "@/components/admin/submission-rows";
import { ReleasePanel } from "@/components/admin/release-panel";
import { fetchSubmissions, type AdminSubmission, type RosterStudent } from "@/lib/admin-submissions";

/**
 * รายการผู้ส่ง (realtime ผ่าน problem-submissions:<id>) + คนที่ยังไม่ส่ง
 * ได้ข้อความแล้วดึงรายการใหม่ (รวบหลายข้อความในช่วงสั้นๆ เป็นครั้งเดียว)
 */
export function SubmissionsMonitor({
  problemId,
  maxScore,
  initialOpen,
  initialSubmissions,
  roster,
  release,
}: {
  problemId: number;
  maxScore: number;
  initialOpen: boolean;
  initialSubmissions: AdminSubmission[];
  roster: RosterStudent[];
  release: { url: string; releasedAt: string } | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [section, setSection] = useState("");
  const [pageSize, setPageSize] = useState<number>(20); // 0 = ทั้งหมด
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "order", dir: "asc" });
  // คะแนนที่ใช้เรียง "แช่แข็ง" ไว้ตอนเลือกการเรียง — ให้คะแนนแล้วแถวไม่กระโดดหนี
  // (คำนวณใหม่เมื่อคลิกหัวคอลัมน์ หรือมีคนส่งเพิ่ม)
  const [frozen, setFrozen] = useState(() => ({ count: initialSubmissions.length, scores: scoreMap(initialSubmissions) }));
  if (frozen.count !== submissions.length) {
    setFrozen({ count: submissions.length, scores: scoreMap(submissions) });
  }
  const [page, setPage] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      setSubmissions(await fetchSubmissions(supabase, problemId));
    } catch (e) {
      console.error("reload submissions failed", e);
    }
  }, [supabase, problemId]);

  const scheduleReload = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void reload();
    }, 300);
  }, [reload]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const resync = useCallback(async () => {
    void reload();
    const { data } = await supabase.from("problem_status").select("is_open").eq("problem_id", problemId).single();
    if (data) setIsOpen(data.is_open);
  }, [reload, supabase, problemId]);

  const connection = useBroadcast(
    supabase,
    [
      { topic: `problem-submissions:${problemId}`, event: "submission", onMessage: scheduleReload },
      {
        topic: "problem-state",
        event: "state",
        onMessage: (m) => {
          if (Number(m.problem_id) === problemId) setIsOpen(Boolean(m.is_open));
        },
      },
    ],
    () => void resync(),
  );

  const sections = useMemo(
    () => [...new Set(roster.map((s) => s.section))].sort((a, b) => a.localeCompare(b, "th")),
    [roster],
  );
  const submittedIds = new Set(submissions.map((s) => s.student_user_id));
  const shownSubs = submissions.filter((s) => !section || s.section === section);
  const pending = roster.filter((s) => !submittedIds.has(s.user_id) && (!section || s.section === section));
  const rosterInSection = roster.filter((s) => !section || s.section === section).length;
  const graded = submissions.filter((s) => s.result).length;
  const onGraded = (id: number) => (result: NonNullable<AdminSubmission["result"]>) =>
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, result } : s)));

  // เรียงก่อน แล้วจึงแบ่งหน้า (หน้าละ 20 เป็นค่าเริ่มต้น, 0 = แสดงทั้งหมด)
  const sortedSubs = sortSubmissions(shownSubs, sort.key, sort.dir, frozen.scores);
  const pageCount = pageSize ? Math.max(1, Math.ceil(sortedSubs.length / pageSize)) : 1;
  const currentPage = Math.min(page, pageCount);
  const pageSubs = pageSize ? sortedSubs.slice((currentPage - 1) * pageSize, currentPage * pageSize) : sortedSubs;

  function toggleSort(key: SortKey) {
    setSort((cur) => ({ key, dir: cur.key === key && cur.dir === "asc" ? "desc" : "asc" }));
    setFrozen({ count: submissions.length, scores: scoreMap(submissions) });
    setPage(1);
  }
  const header = (key: SortKey, label: string, className = "") => (
    <th
      className={`px-3 py-2 ${className}`}
      aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="inline-flex items-center gap-1 font-semibold hover:underline" onClick={() => toggleSort(key)}>
        {label}
        <span aria-hidden className="text-xs text-foreground/50">
          {sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
              isOpen ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-muted text-foreground/70"
            }`}
            data-testid="detail-status"
          >
            {isOpen ? "เปิดรับคำตอบ" : "ปิดรับคำตอบ"}
          </span>
          <span className="text-sm">
            ส่งแล้ว <strong data-testid="detail-count">{submissions.length}</strong> คน · ยังไม่ส่ง{" "}
            <strong data-testid="pending-count">{roster.filter((s) => !submittedIds.has(s.user_id)).length}</strong> คน
          </span>
          <span className="text-xs text-foreground/60" data-testid="realtime-status" data-state={connection}>
            {connection === "connected" ? "อัปเดตอัตโนมัติ" : "กำลังเชื่อมต่อ…"}
          </span>
        </div>
        <OpenToggle problemId={problemId} isOpen={isOpen} size="md" onChanged={setIsOpen} />
      </div>

      <ReleasePanel problemId={problemId} graded={graded} total={submissions.length} initial={release} />

      <label className="field max-w-xs">
        <span>ตอนเรียน</span>
        <select
          value={section}
          onChange={(e) => {
            setSection(e.target.value);
            setPage(1);
          }}
          className="input"
          aria-label="กรองตามตอนเรียน"
        >
          <option value="">ทุกตอนเรียน</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              ตอน {s}
            </option>
          ))}
        </select>
      </label>

      <section aria-labelledby="subs-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="subs-heading" className="font-semibold">
            ผู้ส่ง ({shownSubs.length} คน)
          </h2>
          <Pager
            page={currentPage}
            pageCount={pageCount}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {header("order", "ลำดับ", "w-20 text-right")}
                {header("student", "รหัสนิสิต")}
                {header("time", "เวลา")}
                {header("score", "คะแนน")}
                <th className="px-3 py-2">ความเห็น</th>
              </tr>
            </thead>
            <tbody>
              {pageSubs.map((s) => (
                <SubmissionRows key={s.id} submission={s} maxScore={maxScore} supabase={supabase} onGraded={onGraded(s.id)} />
              ))}
              {shownSubs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-foreground/60">
                    ยังไม่มีผู้ส่ง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="flex justify-end">
            <Pager page={currentPage} pageCount={pageCount} pageSize={pageSize} onPage={setPage} />
          </div>
        )}
      </section>

      <section aria-labelledby="pending-heading" className="flex flex-col gap-2">
        <h2 id="pending-heading" className="font-semibold">
          ยังไม่ส่ง ({pending.length} จาก {rosterInSection} คน)
        </h2>
        {pending.length === 0 ? (
          <p className="card text-center text-foreground/60">ส่งครบทุกคนแล้ว</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3" data-testid="pending-list">
            {pending.map((s) => (
              <li key={s.user_id} className="rounded-lg border border-border px-3 py-1.5 text-sm" data-testid={`pending-${s.student_id}`}>
                <span className="font-mono">{s.student_id}</span> {s.first_name} {s.last_name}
                <span className="text-foreground/50"> · ตอน {s.section}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const PAGE_SIZES = [20, 50, 100, 0];

function Pager({
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="แบ่งหน้า">
      {onPageSize && (
        <label className="flex items-center gap-1">
          <span className="text-foreground/60">แสดง</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="input w-auto px-2 py-1 text-sm"
            aria-label="จำนวนต่อหน้า"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "ทั้งหมด" : `${n} คน/หน้า`}
              </option>
            ))}
          </select>
        </label>
      )}
      {pageCount > 1 && (
        <>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            ‹ ก่อนหน้า
          </button>
          <span data-testid="page-indicator">
            หน้า {page} / {pageCount}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            ถัดไป ›
          </button>
        </>
      )}
    </nav>
  );
}

type SortKey = "order" | "student" | "time" | "score";

function scoreMap(subs: AdminSubmission[]): Map<number, number | null> {
  return new Map(subs.map((s) => [s.id, s.result ? s.result.score : null]));
}

/** เรียงตามคอลัมน์ — คะแนน: คนที่ยังไม่ให้คะแนนอยู่ท้ายเสมอ, คะแนนเท่ากันเรียงตามลำดับการส่ง */
function sortSubmissions(
  subs: AdminSubmission[],
  key: SortKey,
  dir: "asc" | "desc",
  scores: Map<number, number | null>,
): AdminSubmission[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...subs].sort((a, b) => {
    if (key === "score") {
      const sa = scores.has(a.id) ? scores.get(a.id)! : (a.result?.score ?? null);
      const sb = scores.has(b.id) ? scores.get(b.id)! : (b.result?.score ?? null);
      if (sa === null && sb === null) return a.submit_order - b.submit_order;
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sa !== sb ? sign * (sa - sb) : a.submit_order - b.submit_order;
    }
    if (key === "student") return sign * a.student_id.localeCompare(b.student_id);
    if (key === "time") {
      const d = Date.parse(a.submitted_at) - Date.parse(b.submitted_at);
      return sign * (d !== 0 ? d : a.submit_order - b.submit_order);
    }
    return sign * (a.submit_order - b.submit_order);
  });
}
