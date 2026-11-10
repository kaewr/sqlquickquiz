"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentProblems, type CurrentProblem } from "@/lib/current-problems";
import { ProblemCard } from "@/components/student/problem-card";

const COUNT_MODE = process.env.NEXT_PUBLIC_COUNT_MODE === "polling" ? "polling" : "realtime";
const POLL_MS = 5_000;

type Connection = "connecting" | "connected" | "reconnecting";

/**
 * แท็บ "โจทย์ปัจจุบัน"
 * - problem-state (เปิด/ปิด) ผ่าน Broadcast เสมอ
 * - problem-counts ผ่าน Broadcast เฉพาะโหมด realtime; โหมด polling ถามทุก 5 วินาที
 * - ต่อกลับมาได้ / แท็บกลับมาแสดง → ดึงสถานะใหม่ทั้งหมด
 */
export function CurrentProblems({ initial }: { initial: CurrentProblem[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [problems, setProblems] = useState<CurrentProblem[]>(initial);
  const [stateLink, setStateLink] = useState<Connection>("connecting");
  const [countsLink, setCountsLink] = useState<Connection>(COUNT_MODE === "realtime" ? "connecting" : "connected");
  // "connected" เมื่อทุกช่องที่ต้องใช้ subscribe สำเร็จ
  const connection: Connection =
    stateLink === "connected" && countsLink === "connected"
      ? "connected"
      : stateLink === "reconnecting" || countsLink === "reconnecting"
        ? "reconnecting"
        : "connecting";
  // ค่าล่าสุดสำหรับ callback ของ realtime/polling (ไม่ต้องสมัครช่องใหม่ทุกครั้งที่ state เปลี่ยน)
  const problemsRef = useRef(problems);
  useEffect(() => {
    problemsRef.current = problems;
  }, [problems]);

  const upsert = useCallback((incoming: CurrentProblem[]) => {
    setProblems((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const p of incoming) map.set(p.id, { ...map.get(p.id), ...p });
      return [...map.values()].sort((a, b) => a.id - b.id);
    });
  }, []);

  const patch = useCallback((id: number, change: Partial<CurrentProblem>) => {
    setProblems((prev) => prev.map((p) => (p.id === id ? { ...p, ...change } : p)));
  }, []);

  /** ดึงใหม่ทั้งหมด: ข้อที่เปิดอยู่ + อัปเดตสถานะของการ์ดที่แสดงอยู่ (ข้อที่ปิดแล้วยังค้างการ์ดไว้) */
  const resync = useCallback(async () => {
    try {
      const open = await fetchCurrentProblems(supabase);
      const openIds = new Set(open.map((p) => p.id));
      const shownClosed = problemsRef.current.filter((p) => !openIds.has(p.id)).map((p) => p.id);
      const others = shownClosed.length ? await fetchCurrentProblems(supabase, { ids: shownClosed }) : [];
      upsert([...open, ...others]);
    } catch (e) {
      console.error("resync failed", e);
    }
  }, [supabase, upsert]);

  // Realtime (Broadcast, ช่อง private)
  useEffect(() => {
    let cancelled = false;
    let firstSubscribe = true;
    const channels: ReturnType<typeof supabase.channel>[] = [];

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const state = supabase
        .channel("problem-state", { config: { private: true } })
        .on("broadcast", { event: "state" }, async ({ payload }) => {
          const id = Number(payload.problem_id);
          const isOpen = Boolean(payload.is_open);
          const known = problemsRef.current.some((p) => p.id === id);
          if (known) patch(id, { is_open: isOpen });
          else if (isOpen) upsert(await fetchCurrentProblems(supabase, { ids: [id] }));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setStateLink("connected");
            if (!firstSubscribe) void resync(); // ต่อกลับมาได้ → กันพลาดเหตุการณ์ตอนหลุด
            firstSubscribe = false;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setStateLink("reconnecting");
          }
        });
      channels.push(state);

      if (COUNT_MODE === "realtime") {
        const counts = supabase
          .channel("problem-counts", { config: { private: true } })
          .on("broadcast", { event: "count" }, ({ payload }) => {
            patch(Number(payload.problem_id), { submission_count: Number(payload.submission_count) });
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") setCountsLink("connected");
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setCountsLink("reconnecting");
          });
        channels.push(counts);
      }
    })();

    return () => {
      cancelled = true;
      for (const c of channels) void supabase.removeChannel(c);
    };
  }, [supabase, patch, upsert, resync]);

  // โหมด polling: ถามตัวนับทุก 5 วินาที
  useEffect(() => {
    if (COUNT_MODE !== "polling") return;
    const timer = setInterval(async () => {
      const ids = problemsRef.current.map((p) => p.id);
      if (ids.length === 0 || document.visibilityState !== "visible") return;
      const { data } = await supabase.from("problem_status").select("problem_id, submission_count").in("problem_id", ids);
      for (const row of data ?? []) patch(row.problem_id, { submission_count: row.submission_count });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [supabase, patch]);

  // แท็บกลับมาแสดง (เช่นมือถือปลดล็อกหน้าจอ) → ดึงใหม่
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [resync]);

  return (
    <div className="flex flex-col gap-4">
      <p
        className="flex items-center gap-2 text-xs text-foreground/60"
        data-testid="realtime-status"
        data-state={connection}
        aria-live="polite"
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${connection === "connected" ? "bg-green-500" : "bg-amber-500"}`}
          aria-hidden
        />
        {connection === "connected" ? "อัปเดตอัตโนมัติ" : connection === "connecting" ? "กำลังเชื่อมต่อ…" : "กำลังเชื่อมต่อใหม่…"}
      </p>

      {problems.length === 0 ? (
        <p className="card text-center text-foreground/60">ยังไม่มีโจทย์ที่เปิดอยู่ — เมื่ออาจารย์เปิดโจทย์จะแสดงที่นี่เอง</p>
      ) : (
        problems.map((p) => (
          <ProblemCard
            key={p.id}
            problem={p}
            // ลำดับที่ของเรา = ตัวนับ ณ ตอนส่ง → อัปเดตทันทีไม่ต้องรอ broadcast/polling
            onSubmitted={(submission) =>
              setProblems((prev) =>
                prev.map((x) =>
                  x.id === p.id
                    ? { ...x, submission, submission_count: Math.max(x.submission_count, submission.submit_order) }
                    : x,
                ),
              )
            }
            onClosed={() => patch(p.id, { is_open: false })}
            onAlreadySubmitted={() => void fetchCurrentProblems(supabase, { ids: [p.id] }).then(upsert)}
          />
        ))
      )}
    </div>
  );
}
