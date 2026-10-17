"use client";

import { UserAvatar } from "@/components/ui/UserAvatar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { WinnerCheck, type ChatLine, type DrawnWinner } from "./WinnerCheck";

// Kick giveaway control panel — same layout/workflow as the reference tool
// (keyword bar + listen, platform buttons, filter pills, avatar reel with a
// center indicator, big roll button, entries list, winner modal) but in the
// ONO look: dark + gold + volt, rounded, real fonts. No pixel/Minecraft.
//
// Entries are REAL (Kick webhook → DB, polled here). The winner is chosen
// server-side (provably fair) before the reel plays; the reel only presents it.

interface Entry {
  username: string;
  avatar: string | null;
  platform: "kick";
  isSubscriber: boolean;
  excluded: boolean;
  eligible: boolean;
  createdAt: string;
}
interface Winner {
  username: string;
  avatar: string | null;
  platform: string;
  nonce: number;
}
interface Data {
  giveaway: { id: number; title: string; prize: string; status: string; keyword: string | null; subscribersOnly: boolean; minMessages: number; acceptingEntries: boolean; poolLocked: boolean };
  kickConfigured: boolean;
  entries: Entry[];
  eligibleCount: number;
  winners: { username: string; avatar: string | null; nonce: number; response?: "waiting" | "confirmed" | "no_show"; awarded?: boolean }[];
}

// ── WebAudio SFX (no asset files) ──
let actx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    actx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return actx;
  } catch {
    return null;
  }
}
function tick(muted: boolean) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "square";
  o.frequency.value = 300;
  g.gain.value = 0.03;
  o.connect(g);
  g.connect(a.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.05);
  o.stop(a.currentTime + 0.06);
}
function chime(muted: boolean) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = a.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + 0.45);
  });
}

function Avatar({ src, name, size = 44 }: { src: string | null; name: string; size?: number }) {
  return <UserAvatar src={src} name={name} className="h-full w-full rounded-full" style={{ width: size, height: size }} />;
}

const CARD = 120;

const FILTERS = [
  { key: "subs", label: "Subscribed", available: true },
  { key: "active", label: "Active", available: true },
  { key: "vips", label: "VIPs", available: false },
  { key: "gifted", label: "Gifted", available: false },
];

export function GiveawayDashboard({ id, initial, defaultChannel, guildId = null }: { id: number; initial: Data; defaultChannel: string; guildId?: string | null }) {
  const [data, setData] = useState<Data>(initial);
  const [channel, setChannel] = useState(defaultChannel);
  const [channelDraft, setChannelDraft] = useState(defaultChannel);

  // remember the last channel used for testing (per browser)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("odt.giveaway.channel");
      if (saved) {
        setChannel(saved);
        setChannelDraft(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);
  function applyChannel(next: string) {
    const c = next.trim().toLowerCase().replace(/^https?:\/\/(www\.)?kick\.com\//, "").replace(/\/.*$/, "");
    if (!c) return;
    setChannel(c);
    setChannelDraft(c);
    try {
      localStorage.setItem("odt.giveaway.channel", c);
    } catch {
      /* ignore */
    }
  }
  const [spinning, setSpinning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [modalWinner, setModalWinner] = useState<DrawnWinner | null>(null);
  // reopened from the winners list to enter a payout (no 15 s window)
  const [resume, setResume] = useState(false);
  // the drawn winner's chat lines (the 15 s response window reads these)
  const [winnerChat, setWinnerChat] = useState<ChatLine[]>([]);
  const watchRef = useRef<string | null>(null);
  const [drawAt, setDrawAt] = useState(0);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<"off" | "connecting" | "connected" | "error">("off");

  const stripRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [reelEntries, setReelEntries] = useState<Entry[]>([]);
  const spinningRef = useRef(false);

  const g = data.giveaway;
  const listening = g.acceptingEntries;
  const listeningRef = useRef(listening);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  // keep reading chat while collecting entries AND while a drawn winner has to answer
  const socketOn = listening || spinning || modalWinner != null;
  const finished = g.status === "closed" && g.poolLocked;
  const eligible = data.entries.filter((e) => e.eligible);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/giveaways/${id}/entries`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => {
      if (!spinningRef.current) refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  // Live Kick chat reader. While the giveaway is open, connect to Kick's public
  // chat socket in the browser, match the keyword, and record real entries.
  // It stays connected through a draw so the winner's messages reach the
  // 15 s response window (WinnerCheck).
  // Unofficial (Kick publishes no chat API) but works locally and in prod with
  // no OAuth/webhook. See lib/kickChat.ts.
  useEffect(() => {
    if (!socketOn) {
      setLiveStatus("off");
      return;
    }
    let ws: WebSocket | null = null;
    let closedByUs = false;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        refresh();
      }, 1200);
    };

    interface PusherMsg { event: string; data: string }
    interface ChatPayload { content?: string; sender?: { username?: string; identity?: { badges?: { type?: string }[] } } }

    async function connect() {
      setLiveStatus("connecting");
      let info: {
        ok?: boolean;
        wsUrl?: string;
        socketChannel?: string;
        chatEvent?: string;
        keyword?: string | null;
      } | null = null;
      try {
        const res = await fetch(`/api/admin/giveaways/${id}/listen-info?channel=${encodeURIComponent(channel)}`, { cache: "no-store" });
        info = await res.json();
      } catch {
        info = null;
      }
      if (!info?.ok || !info.wsUrl) {
        setLiveStatus("error");
        if (!closedByUs) reconnect = setTimeout(connect, 5000);
        return;
      }
      const { wsUrl, socketChannel, chatEvent } = info;
      const kw = (info.keyword ?? "").trim().toLowerCase();
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setLiveStatus("error");
        return;
      }
      ws.onopen = () => ws?.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: socketChannel } }));
      ws.onmessage = (ev) => {
        let msg: PusherMsg;
        try {
          msg = JSON.parse(ev.data as string) as PusherMsg;
        } catch {
          return;
        }
        if (msg.event === "pusher:connection_established" || msg.event === "pusher_internal:subscription_succeeded") {
          setLiveStatus("connected");
          return;
        }
        if (msg.event === "pusher:ping") {
          ws?.send(JSON.stringify({ event: "pusher:pong", data: {} }));
          return;
        }
        if (msg.event !== chatEvent) return;
        let payload: ChatPayload;
        try {
          payload = JSON.parse(msg.data) as ChatPayload;
        } catch {
          return;
        }
        const content = String(payload.content ?? "");
        const username = payload.sender?.username;
        if (!username) return;
        if (watchRef.current && username.toLowerCase() === watchRef.current) {
          setWinnerChat((lines) => [...lines, { text: content.slice(0, 300), at: Date.now() }]);
        }
        if (!listeningRef.current) return;
        if (kw && !content.trim().toLowerCase().startsWith(kw)) return;
        const badges = payload.sender?.identity?.badges ?? [];
        const isSubscriber = Array.isArray(badges) && badges.some((b) => b?.type === "subscriber");
        fetch(`/api/admin/giveaways/${id}/entry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, isSubscriber }),
        })
          .then(() => scheduleRefresh())
          .catch(() => {});
      };
      ws.onerror = () => setLiveStatus("error");
      ws.onclose = () => {
        if (!closedByUs) {
          setLiveStatus("connecting");
          reconnect = setTimeout(connect, 2500);
        }
      };
    }
    connect();

    return () => {
      closedByUs = true;
      setLiveStatus("off");
      if (reconnect) clearTimeout(reconnect);
      if (pending) clearTimeout(pending);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [socketOn, id, refresh, channel]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function post(path: string, body?: unknown, method = "POST") {
    return fetch(`/api/admin/giveaways/${id}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function toggleListening() {
    setBusy(true);
    const next = g.poolLocked || listening ? "closed" : "open";
    try {
      const res = await post("/status", { status: next });
      if (!res.ok) throw new Error();
      await refresh();
      flash(next === "open" ? "Listening to Kick chat" : g.poolLocked ? "Round finished — results are now verifiable" : "Stopped listening");
    } catch {
      flash("Couldn't update listening state");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFilter(key: string) {
    if (busy || spinning || g.poolLocked) return;
    setBusy(true);
    try {
      const res = await post("/filters", {
        subscribersOnly: key === "subs" ? !g.subscribersOnly : g.subscribersOnly,
        minMessages: key === "active" ? (g.minMessages > 1 ? 1 : 2) : g.minMessages,
      });
      if (!res.ok) throw new Error();
      await refresh();
      flash("Entry rules updated");
    } catch { flash("Couldn't update entry rules"); }
    finally { setBusy(false); }
  }

  async function exclude(username: string, excluded: boolean) {
    if (excluded && !confirm(`Exclude ${username} from this giveaway?`)) return;
    try {
      const res = await post("/exclude", { username, excluded });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      flash("Couldn't update entry");
    }
  }

  async function clearAll() {
    if (!confirm("Clear ALL entries and winners for this giveaway?")) return;
    setBusy(true);
    try {
      const res = await post("/test", undefined, "DELETE");
      if (!res.ok) throw new Error();
      setReelEntries([]);
      await refresh();
      flash("New round ready");
    } catch { flash("Couldn't reset the round"); } finally {
      setBusy(false);
    }
  }

  function buildReel(winner: Winner): { items: Entry[]; landing: number } {
    const base =
      eligible.length > 0
        ? eligible
        : [{ username: winner.username, avatar: winner.avatar, platform: "kick", isSubscriber: false, excluded: false, eligible: true, createdAt: "" } as Entry];
    const seq: Entry[] = [];
    const shuffled = () => [...base].sort(() => Math.random() - 0.5);
    while (seq.length < 44) seq.push(...shuffled());
    const landing = seq.length;
    const winnerEntry =
      data.entries.find((e) => e.username.toLowerCase() === winner.username.toLowerCase()) ??
      ({ username: winner.username, avatar: winner.avatar, platform: "kick", isSubscriber: false, excluded: false, eligible: true, createdAt: "" } as Entry);
    seq.push(winnerEntry);
    for (let i = 0; i < 6; i++) seq.push(...shuffled().slice(0, 1));
    return { items: seq.slice(0, landing + 7), landing };
  }

  function runReel(winner: Winner, onDone: () => void) {
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { items, landing } = buildReel(winner);
    setReelEntries(items);
    setData((d) => ({ ...d }));
    requestAnimationFrame(() => {
      const vp = viewportRef.current;
      const strip = stripRef.current;
      if (!vp || !strip) return onDone();
      const target = -(landing * CARD + CARD / 2 - vp.clientWidth / 2);
      if (reduce) {
        strip.style.transform = `translateX(${target}px)`;
        return onDone();
      }
      const start = performance.now();
      const dur = 4200;
      let lastIdx = -1;
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        const x = target * eased;
        strip.style.transform = `translateX(${x}px)`;
        const centered = Math.round((-x + vp.clientWidth / 2 - CARD / 2) / CARD);
        if (centered !== lastIdx) {
          lastIdx = centered;
          tick(muted);
        }
        if (k < 1) requestAnimationFrame(step);
        else onDone();
      };
      requestAnimationFrame(step);
    });
  }

  async function draw() {
    if (spinning || busy) return;
    if (eligible.length === 0) return flash("No eligible entrants yet");
    watchRef.current = null;
    setWinnerChat([]);
    setSpinning(true);
    spinningRef.current = true;
    try {
      const res = await post("/draw", { count: 1 });
      if (!res.ok) {
        flash(res.status === 409 ? "No eligible entrants" : "Draw failed");
        setSpinning(false);
        spinningRef.current = false;
        return;
      }
      const { winner } = (await res.json()) as { winner: Winner };
      // watch the winner's chat from the draw itself: the stream overlay shows
      // their name before the reel lands, so they may answer during the spin
      watchRef.current = winner.username.toLowerCase();
      setDrawAt(Date.now());
      setResume(false);
      runReel(winner, () => {
        watchRef.current = winner.username.toLowerCase();
        setModalWinner({ username: winner.username, avatar: winner.avatar, nonce: winner.nonce });
        chime(muted);
        setSpinning(false);
        spinningRef.current = false;
        refresh();
      });
    } catch {
      flash("Draw failed");
      setSpinning(false);
      spinningRef.current = false;
    }
  }

  const winnerEntry = modalWinner ? data.entries.find((e) => e.username.toLowerCase() === modalWinner.username.toLowerCase()) : null;
  const filtered = data.entries.filter((e) => e.username.toLowerCase().includes(search.trim().toLowerCase()));
  const reelItems = reelEntries.length > 0 ? reelEntries : eligible;

  const statusDot = !listening ? (finished ? "bg-text-2" : "bg-gold") : liveStatus === "connected" ? "bg-volt" : liveStatus === "error" ? "bg-danger" : "bg-gold";
  const statusText = !listening
    ? finished ? "Finished" : g.poolLocked ? "Drawn" : "Not listening"
    : liveStatus === "connected" ? "Live" : liveStatus === "error" ? "Chat unreachable" : "Connecting…";
  const confirmed = data.winners.filter((w) => w.response !== "no_show");
  const iconBtn = "press grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-text-2 hover:border-line-strong hover:text-text-0";

  return (
    <div className="space-y-3">
      {toast && (
        <div className="pop-in fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-xl border border-line-strong bg-bg-1 px-4 py-2 text-sm text-text-0 shadow-lg">
          {toast}
        </div>
      )}

      {/* toolbar: what, status, where, listen */}
      <div className="surface flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {listening && liveStatus === "connected" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${statusDot}`} />
          </span>
          <h1 className="truncate font-display text-lg font-bold">{g.title}</h1>
          <span className="shrink-0 rounded-md bg-gold/10 px-2 py-0.5 text-sm font-semibold text-gold">{g.prize || "—"}</span>
          <span className="shrink-0 text-xs text-text-2">{statusText}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-text-1">
          <span><b className="font-mono text-text-0">{data.eligibleCount}</b> eligible</span>
          <span className="text-line-strong">·</span>
          <span><b className="font-mono text-text-0">{data.entries.length}</b> entries</span>
          <span className="text-line-strong">·</span>
          <span><b className="font-mono text-text-0">{confirmed.length}</b> winners</span>
          <span className="text-line-strong">·</span>
          <span className="font-mono text-gold">{g.keyword ?? "—"}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex h-9 w-52 items-center gap-1.5 rounded-lg border border-line bg-bg-0/50 px-2.5 focus-within:border-gold">
            <span className="text-xs text-text-2">kick.com/</span>
            <input
              value={channelDraft}
              onChange={(e) => setChannelDraft(e.target.value)}
              onBlur={() => applyChannel(channelDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyChannel(channelDraft);
                }
              }}
              placeholder="channel"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm text-text-0 placeholder:text-text-2 focus:outline-none"
              aria-label="Kick channel to read"
            />
          </label>
          <button
            onClick={toggleListening}
            disabled={busy || spinning || finished}
            className={`press inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold disabled:opacity-50 ${listening ? "border border-volt/50 text-volt" : "bg-volt text-bg-0 hover:brightness-110"}`}
          >
            <Icon name={listening ? "Square" : "Play"} className="h-3.5 w-3.5" />
            {finished ? "Finished" : g.poolLocked ? "Finish & reveal" : listening ? "Stop" : "Listen"}
          </button>
          <button onClick={() => setMuted((m) => !m)} className={iconBtn} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"}>
            <Icon name={muted ? "VolumeX" : "Volume2"} className="h-4 w-4" />
          </button>
          <a href={`/verify/${id}`} target="_blank" className={iconBtn} aria-label="Provably-fair proof" title="Provably-fair proof">
            <Icon name="ShieldCheck" className="h-4 w-4" />
          </a>
        </div>
      </div>

      {listening && liveStatus === "error" && (
        <p className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-text-1">
          <Icon name="TriangleAlert" className="h-4 w-4 shrink-0 text-danger" />
          Can&rsquo;t read kick.com/{channel} right now — retrying. Webhook entries still count; check the channel name.
        </p>
      )}

      {/* draw */}
      <section className="surface flex flex-col gap-3 p-4">
          <div ref={viewportRef} className="relative h-36 overflow-hidden rounded-xl border border-line bg-bg-0">
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gold/60" />
            <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-gold/70" />
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-bg-0 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-bg-0 to-transparent" />
            <div ref={stripRef} className="absolute inset-y-0 left-0 flex items-center" style={{ willChange: "transform" }}>
              {reelItems.map((e, i) => (
                <div key={i} className="flex flex-col items-center justify-center" style={{ width: CARD }}>
                  <span className="h-14 w-14 overflow-hidden rounded-full ring-1 ring-line-strong"><Avatar src={e.avatar} name={e.username} size={56} /></span>
                  <span className="mt-1.5 max-w-[110px] truncate font-mono text-xs text-text-1">{e.username}</span>
                </div>
              ))}
              {reelItems.length === 0 && (
                <div className="flex h-full w-[min(80vw,900px)] items-center justify-center text-sm text-text-2">
                  No entries yet — chat types <span className="mx-1 font-mono text-gold">{g.keyword ?? "the keyword"}</span> while you listen.
                </div>
              )}
            </div>
          </div>

          <button
            onClick={draw}
            disabled={spinning || busy || finished || eligible.length === 0}
            className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gold text-base font-bold uppercase tracking-wide text-bg-0 hover:bg-gold-hi disabled:opacity-50"
          >
            {spinning ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-bg-0/30 border-t-bg-0" /> Rolling…</>
            ) : (
              <><Icon name="Sparkles" className="h-5 w-5" /> {finished ? "Round finished" : "Roll winner"}</>
            )}
          </button>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {FILTERS.filter((f) => f.available).map((f) => {
              const active = f.key === "subs" ? g.subscribersOnly : f.key === "active" && g.minMessages > 1;
              return (
                <button type="button" key={f.key} onClick={() => toggleFilter(f.key)} disabled={busy || spinning || g.poolLocked} aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 disabled:opacity-50 ${active ? "border-gold/50 text-gold" : "border-line text-text-2 hover:text-text-0"}`}>
                  <Icon name={active ? "SquareCheckBig" : "Square"} className="h-3.5 w-3.5" /> {f.key === "subs" ? "Subs only" : "2+ messages"}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={clearAll} disabled={busy || spinning} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-text-2 hover:border-danger hover:text-danger disabled:opacity-50">
                <Icon name="RotateCcw" className="h-3.5 w-3.5" /> New round
              </button>
            </div>
          </div>

          {data.winners.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
              <span className="mr-1 text-xs text-text-2">Winners</span>
              {data.winners.map((w) => w.response === "confirmed" && !w.awarded ? (
                <button key={w.nonce} type="button" title="Confirmed — enter the payout to create the prize"
                  onClick={() => { watchRef.current = null; setResume(true); setModalWinner({ username: w.username, avatar: w.avatar, nonce: w.nonce }); }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gold/60 bg-gold/10 py-0.5 pl-0.5 pr-2.5 text-xs font-semibold text-gold hover:bg-gold/20">
                  <span className="h-5 w-5 overflow-hidden rounded-full"><Avatar src={w.avatar} name={w.username} size={20} /></span>
                  {w.username} · $ set payout
                </button>
              ) : (
                <span key={w.nonce} title={w.response === "no_show" ? "No response in chat — no prize" : w.response === "waiting" ? "Waiting for an answer in chat" : "Prize recorded"}
                  className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs ${w.response === "no_show" ? "border-line text-text-2 line-through" : w.response === "waiting" ? "border-line-strong text-text-1" : "border-gold/40 text-gold"}`}>
                  <span className="h-5 w-5 overflow-hidden rounded-full"><Avatar src={w.avatar} name={w.username} size={20} /></span>
                  {w.username}
                </span>
              ))}
            </div>
          )}
      </section>

      {/* entries: dense grid, scrolls inside when long */}
      <section className="surface flex max-h-[calc(100dvh-27rem)] min-h-[12rem] flex-col p-3">
          <div className="flex items-center gap-2 pb-2">
            <p className="text-sm font-semibold">Entries <span className="font-mono text-text-2">{data.eligibleCount}/{data.entries.length}</span></p>
            <label className="ml-auto flex h-8 w-40 items-center gap-1.5 rounded-lg border border-line bg-bg-0/50 px-2">
              <Icon name="Search" className="h-3.5 w-3.5 text-text-2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" aria-label="Search entries" className="h-full min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
            </label>
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-2">{data.entries.length === 0 ? "Nobody has entered yet." : "No matches."}</p>
          ) : (
            <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(190px,1fr))] content-start gap-1.5 overflow-y-auto">
              {filtered.map((e) => (
                <div key={e.username} className={`group flex items-center gap-2 rounded-lg border border-line/70 bg-bg-1/40 py-1 pl-1 pr-1.5 ${e.excluded ? "opacity-50" : ""}`}>
                  <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full"><Avatar src={e.avatar} name={e.username} size={28} /></span>
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-text-0">{e.username}</span>
                  {e.isSubscriber && <span className="rounded bg-bg-3 px-1.5 text-[10px] font-semibold uppercase text-text-1">sub</span>}
                  {!e.eligible && !e.excluded && <span className="text-[10px] text-text-2">not eligible</span>}
                  <button onClick={() => exclude(e.username, !e.excluded)} disabled={g.poolLocked || spinning || busy}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-2 opacity-0 hover:bg-bg-3 hover:text-text-0 group-hover:opacity-100 disabled:hidden" title={e.excluded ? "Restore" : "Exclude"}>
                    <Icon name={e.excluded ? "RotateCcw" : "Ban"} className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
      </section>

      {/* winner modal: 15 s to answer in chat */}
      {modalWinner && (
        <WinnerCheck
          key={modalWinner.nonce}
          giveawayId={id}
          winner={modalWinner}
          messages={winnerChat}
          since={drawAt}
          chat={{ channel, status: liveStatus }}
          isSubscriber={Boolean(winnerEntry?.isSubscriber)}
          muted={muted}
          guildId={guildId}
          resume={resume}
          onReroll={() => { watchRef.current = null; setModalWinner(null); refresh(); draw(); }}
          onClose={() => { watchRef.current = null; setModalWinner(null); refresh(); }}
        />
      )}
    </div>
  );
}
