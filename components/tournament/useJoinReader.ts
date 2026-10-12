"use client";

import { useEffect, useRef, useState } from "react";

// Reads ONO's Kick chat through Kick's public chat socket (the same mechanism
// the giveaway dashboard uses — Kick publishes no official chat-read API) and
// relays every `!join` to the server with the sender's Kick user id and the
// message id. Reconnects with backoff; messages sent while disconnected can't
// be recovered from the socket (the signed Kick webhook covers that when it is
// configured, and both paths share message-id de-duplication).

export type ReaderStatus = "off" | "connecting" | "live" | "reconnecting" | "error";
export interface JoinEvent { at: number; username: string; outcome: string }

interface KickChatEvent { id?: string; content?: string; created_at?: string; sender?: { id?: number | string; username?: string } }

interface RelayOptions {
  /** Whole-message command to relay, e.g. /^\s*!join\s*$/i */
  match: RegExp;
  /** Admin endpoint receiving { messageId, userId, username, content, sentAt } */
  endpoint: string;
}

const JOIN: RelayOptions = { match: /^\s*!join\s*$/i, endpoint: "/api/admin/tournament/join" };

export function useJoinReader(enabled: boolean, onJoin?: () => void, opts: RelayOptions = JOIN) {
  const { match, endpoint } = opts;
  const [status, setStatus] = useState<ReaderStatus>("off");
  const [events, setEvents] = useState<JoinEvent[]>([]);
  const cb = useRef(onJoin);
  useEffect(() => { cb.current = onJoin; }, [onJoin]);

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      try {
        const res = await fetch("/api/admin/tournament/listen-info", { cache: "no-store" });
        const info = (await res.json()) as { ok: boolean; wsUrl: string; socketChannel: string; chatEvent: string };
        if (!info.ok) throw new Error("chatroom_unresolved");
        if (stopped) return;
        ws = new WebSocket(info.wsUrl);
        ws.onopen = () => ws?.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: info.socketChannel } }));
        ws.onmessage = (e) => {
          let msg: { event?: string; data?: string };
          try { msg = JSON.parse(String(e.data)); } catch { return; }
          if (msg.event === "pusher_internal:subscription_succeeded") { attempt = 0; setStatus("live"); return; }
          if (msg.event === "pusher:ping") { ws?.send(JSON.stringify({ event: "pusher:pong", data: {} })); return; }
          if (msg.event !== info.chatEvent || !msg.data) return;
          let chat: KickChatEvent;
          try { chat = JSON.parse(msg.data); } catch { return; }
          if (!chat.content || !match.test(chat.content)) return;
          const userId = chat.sender?.id;
          const username = chat.sender?.username;
          if (!chat.id || userId == null || !username) return;
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: chat.id, userId: String(userId), username, content: chat.content, sentAt: chat.created_at ?? null }),
          })
            .then((r) => r.json())
            .then((d: { outcome?: string; error?: string }) => {
              setEvents((list) => [{ at: Date.now(), username, outcome: d.outcome ?? d.error ?? "error" }, ...list].slice(0, 30));
              cb.current?.();
            })
            .catch(() => setEvents((list) => [{ at: Date.now(), username, outcome: "network_error" }, ...list].slice(0, 30)));
        };
        ws.onclose = () => {
          if (stopped) return;
          setStatus("reconnecting");
          attempt++;
          retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
        };
        ws.onerror = () => ws?.close();
      } catch {
        if (stopped) return;
        setStatus("error");
        attempt++;
        retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
      }
    };
    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      ws?.close();
      setStatus("off");
    };
  }, [enabled, match, endpoint]);

  return { status, events };
}
