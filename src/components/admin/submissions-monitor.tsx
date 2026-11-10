"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBroadcast } from "@/lib/use-broadcast";
import { OpenToggle } from "@/components/admin/open-toggle";
import { fetchSubmissions, type AdminSubmission, type RosterStudent } from "@/lib/admin-submissions";

const timeFormat = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * รายการผู้ส่ง (realtime ผ่าน problem-submissions:<id>) + คนที่ยังไม่ส่ง
 * ได้ข้อความแล้วดึงรายการใหม่ (รวบหลายข้อความในช่วงสั้นๆ เป็นครั้งเดียว)
 */
export function SubmissionsMonitor({
  problemId,
  initialOpen,
  initialSubmissions,
  roster,
}: {
  problemId: number;
  initialOpen: boolean;
  initialSubmissions: AdminSubmission[];
  roster: RosterStudent[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [section, setSection] = useState("");
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

      <label className="field max-w-xs">
        <span>ตอนเรียน</span>
        <select value={section} onChange={(e) => setSection(e.target.value)} className="input" aria-label="กรองตามตอนเรียน">
          <option value="">ทุกตอนเรียน</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              ตอน {s}
            </option>
          ))}
        </select>
      </label>

      <section aria-labelledby="subs-heading" className="flex flex-col gap-2">
        <h2 id="subs-heading" className="font-semibold">
          ผู้ส่ง ({shownSubs.length} คน)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2 text-right">ลำดับ</th>
                <th className="px-3 py-2">รหัสนิสิต</th>
                <th className="px-3 py-2">ชื่อ - นามสกุล</th>
                <th className="px-3 py-2">ตอน</th>
                <th className="px-3 py-2">เวลา</th>
                <th className="px-3 py-2">SQL</th>
              </tr>
            </thead>
            <tbody>
              {shownSubs.map((s) => (
                <tr key={s.id} className="border-t border-border align-top" data-testid={`sub-row-${s.student_id}`}>
                  <td className="px-3 py-2 text-right tabular-nums">{s.submit_order}</td>
                  <td className="px-3 py-2 font-mono">{s.student_id}</td>
                  <td className="px-3 py-2">
                    {s.first_name} {s.last_name}
                  </td>
                  <td className="px-3 py-2">{s.section}</td>
                  <td className="px-3 py-2 tabular-nums">{timeFormat.format(new Date(s.submitted_at))}</td>
                  <td className="px-3 py-2">
                    <pre className="max-h-48 max-w-xl overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-xs">
                      {s.sql_text}
                    </pre>
                  </td>
                </tr>
              ))}
              {shownSubs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-foreground/60">
                    ยังไม่มีผู้ส่ง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
