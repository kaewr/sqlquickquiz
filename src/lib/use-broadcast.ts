"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BroadcastSub = {
  topic: string;
  event: string;
  onMessage: (payload: Record<string, unknown>) => void;
};

/**
 * สมัคร Broadcast ช่อง private หลายช่อง
 * - คืน "connected" เมื่อทุกช่อง subscribe สำเร็จ
 * - onReconnect: เรียกเมื่อต่อกลับมาได้หลังหลุด หรือแท็บกลับมาแสดง (ให้ดึงข้อมูลใหม่)
 */
export function useBroadcast(
  supabase: SupabaseClient,
  subs: BroadcastSub[],
  onReconnect?: () => void,
): "connecting" | "connected" | "reconnecting" {
  const key = subs.map((s) => `${s.topic}#${s.event}`).join("|");
  const [ready, setReady] = useState<Record<string, "connecting" | "connected" | "reconnecting">>({});
  const handlers = useRef(subs);
  const reconnect = useRef(onReconnect);
  useEffect(() => {
    handlers.current = subs;
    reconnect.current = onReconnect;
  });

  useEffect(() => {
    let cancelled = false;
    const channels: ReturnType<SupabaseClient["channel"]>[] = [];
    const topics = key ? key.split("|").map((k) => k.split("#")) : [];

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      for (const [topic, event] of topics) {
        let first = true;
        const ch = supabase
          .channel(topic, { config: { private: true } })
          .on("broadcast", { event }, ({ payload }) => {
            handlers.current.find((s) => s.topic === topic && s.event === event)?.onMessage(payload ?? {});
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              setReady((r) => ({ ...r, [topic]: "connected" }));
              if (!first) reconnect.current?.();
              first = false;
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              setReady((r) => ({ ...r, [topic]: "reconnecting" }));
            }
          });
        channels.push(ch);
      }
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") reconnect.current?.();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      for (const c of channels) void supabase.removeChannel(c);
    };
  }, [supabase, key]);

  const topics = key ? key.split("|").map((k) => k.split("#")[0]) : [];
  const states = topics.map((t) => ready[t] ?? "connecting");
  if (states.length && states.every((s) => s === "connected")) return "connected";
  if (states.some((s) => s === "reconnecting")) return "reconnecting";
  return "connecting";
}
