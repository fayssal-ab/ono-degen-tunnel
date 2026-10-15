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
  winners: { username: string; avatar: string | null; nonce: number; response?: "waiting" | "confirmed" | "no_show" }[];
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

const CARD = 136;

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

  async function addTest() {
    setBusy(true);
    try {
      const res = await post("/test");
      if (!res.ok) throw new Error();
      await refresh();
      flash("Added test entrants (preview)");
    } catch { flash("Start a new round before adding test entrants"); } finally {
      setBusy(false);
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

  const statusTone = !listening ? (finished ? "text-text-2" : "text-gold") : liveStatus === "connected" ? "text-volt" : liveStatus === "error" ? "text-danger" : "text-gold";
  const statusText = !listening
    ? finished ? "Round finished" : g.poolLocked ? "Drawn · ready to reroll" : "Not listening"
    : liveStatus === "connected" ? "Live · reading Kick chat" : liveStatus === "error" ? "Chat unreachable" : "Connecting…";
  const confirmed = data.winners.filter((w) => w.response !== "no_show");

  return (
    <div className="space-y-5">
      {toast && (
        <div className="pop-in fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-xl border border-gold/40 bg-bg-1 px-4 py-2.5 text-sm font-semibold text-text-0 shadow-[0_10px_40px_-12px_rgba(245,196,81,0.5)]">
          {toast}
        </div>
      )}

      {/* ── hero ── */}
      <section className="surface relative isolate overflow-hidden px-6 pb-7 pt-8 md:px-10 md:pt-10">
        <div className="tunnel-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-gold/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-plasma/15 blur-3xl" aria-hidden />

        <div className="relative z-10 flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-1">
            <span className={`label inline-flex items-center gap-2 ${statusTone}`}>
              <span className="relative flex h-2 w-2">
                {listening && liveStatus === "connected" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-60" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${!listening ? (finished ? "bg-text-2" : "bg-gold") : liveStatus === "connected" ? "bg-volt" : liveStatus === "error" ? "bg-danger" : "bg-gold"}`} />
              </span>
              {statusText}
            </span>
            <h1 className="font-bang mt-3 text-4xl [overflow-wrap:anywhere] md:text-6xl">{g.title}</h1>
            <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-1.5">
              <Icon name="Gift" className="h-4 w-4 text-gold" />
              <span className="label text-gold/80">Prize</span>
              <span className="font-display text-lg font-extrabold text-gold neon-gold">{g.prize || "—"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMuted((m) => !m)} className="press grid h-10 w-10 place-items-center rounded-xl border border-line bg-bg-1/70 text-text-1 backdrop-blur hover:border-gold hover:text-gold" aria-label={muted ? "Unmute" : "Mute"}>
              <Icon name={muted ? "VolumeX" : "Volume2"} className="h-4 w-4" />
            </button>
            <a href={`/verify/${id}`} target="_blank" className="press inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-bg-1/70 px-3 text-sm text-text-1 backdrop-blur hover:border-plasma hover:text-plasma">
              <Icon name="ShieldCheck" className="h-4 w-4" /> Fair proof
            </a>
          </div>
        </div>

        <div className="relative z-10 mt-8 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-line pt-5">
          <div className="hero-stat"><p className="font-mono text-3xl font-bold tabular-nums text-volt neon-volt">{data.eligibleCount}</p><p className="label mt-0.5">Eligible</p></div>
          <div className="hero-stat"><p className="font-mono text-3xl font-bold tabular-nums text-text-0">{data.entries.length}</p><p className="label mt-0.5">Entries</p></div>
          <div className="hero-stat"><p className="font-mono text-3xl font-bold tabular-nums text-gold">{confirmed.length}</p><p className="label mt-0.5">Winners</p></div>
          <div className="hero-stat">
            <p className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-xl font-bold text-gold"><Icon name="Hash" className="h-4 w-4" />{g.keyword ?? "—"}</p>
            <p className="label mt-1">Command</p>
          </div>
        </div>
      </section>

      {/* ── controls ── */}
      <section className="surface space-y-4 p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex h-13 flex-1 items-center gap-3 rounded-xl border border-line bg-bg-0/60 px-4 focus-within:border-volt">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#53fc18]/15 text-[#53fc18]"><Icon name="Radio" className="h-4 w-4" /></span>
            <span className="hidden text-sm text-text-2 sm:inline">kick.com/</span>
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
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-base font-semibold text-text-0 placeholder:text-text-2 focus:outline-none"
              aria-label="Kick channel to read"
            />
          </div>
          <button
            onClick={toggleListening}
            disabled={busy || spinning || finished}
            className={`press inline-flex h-13 items-center justify-center gap-2 rounded-xl px-7 text-sm font-extrabold uppercase tracking-wide disabled:opacity-50 ${
              listening ? "border border-volt/60 bg-volt/10 text-volt glow-volt" : "bg-volt text-bg-0 hover:brightness-110"
            }`}
          >
            <Icon name={listening ? "Radio" : "Play"} className={`h-4 w-4 ${listening ? "animate-pulse" : ""}`} />
            {finished ? "Round finished" : g.poolLocked ? "Finish & reveal" : listening ? "Stop listening" : "Start listening"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.filter((f) => f.available).map((f) => {
            const active = f.key === "subs" ? g.subscribersOnly : f.key === "active" && g.minMessages > 1;
            return (
              <button type="button" key={f.key} onClick={() => toggleFilter(f.key)} disabled={busy || spinning || g.poolLocked} aria-pressed={active}
                className={`press inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${active ? "border-volt/60 bg-volt/15 text-volt" : "border-line text-text-1 hover:border-line-strong hover:text-text-0"}`}>
                <Icon name={active ? "CircleCheck" : "Circle"} className="h-3.5 w-3.5" /> {f.key === "subs" ? "Subscribers only" : "Active chatters (2+ msgs)"}
              </button>
            );
          })}
          <span className="text-xs text-text-2">Rules lock after the first draw · repeat wins allowed</span>
        </div>
      </section>

      {listening && liveStatus === "error" && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-text-1">
          <Icon name="TriangleAlert" className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>Couldn&rsquo;t reach Kick&rsquo;s chat socket for <b>kick.com/{channel}</b> (unofficial endpoint, can rate-limit). It keeps retrying; entries from the Kick webhook still count. Check the channel name above.</div>
        </div>
      )}

      {/* ── stage: reel + roll ── */}
      <section className="surface relative isolate overflow-hidden p-4 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(245,196,81,0.12),transparent_70%)]" aria-hidden />
        <div className="relative flex items-center justify-between gap-3 pb-4">
          <p className="font-bang text-2xl tracking-wide md:text-3xl">The draw</p>
          <div className="flex items-center gap-2">
            <button onClick={addTest} disabled={busy || spinning} className="press inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-text-2 hover:text-text-0 disabled:opacity-50" title="Load sample entrants to rehearse the reel">
              <Icon name="FlaskConical" className="h-3.5 w-3.5" /> Test entrants
            </button>
            <button onClick={clearAll} disabled={busy || spinning} className="press inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs text-text-2 hover:border-danger hover:text-danger disabled:opacity-50">
              <Icon name="RotateCcw" className="h-3.5 w-3.5" /> New round
            </button>
          </div>
        </div>

        <div ref={viewportRef} className="relative h-52 overflow-hidden rounded-2xl border border-line-strong bg-bg-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]">
          <div className="tunnel-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-40 w-36 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-gold/70 bg-gold/5 shadow-[0_0_40px_-6px_var(--color-gold),inset_0_0_30px_-10px_var(--color-gold)]" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-gold to-transparent" />
          <div className="pointer-events-none absolute left-1/2 top-1.5 z-20 -translate-x-1/2 text-gold drop-shadow-[0_0_8px_var(--color-gold)]"><Icon name="ChevronDown" className="h-6 w-6" /></div>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-bg-0 via-bg-0/80 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-bg-0 via-bg-0/80 to-transparent" />
          <div ref={stripRef} className="absolute inset-y-0 left-0 flex items-center" style={{ willChange: "transform" }}>
            {reelItems.map((e, i) => (
              <div key={i} className="flex flex-col items-center justify-center" style={{ width: CARD }}>
                <span className="h-20 w-20 overflow-hidden rounded-full ring-2 ring-line-strong ring-offset-4 ring-offset-bg-0"><Avatar src={e.avatar} name={e.username} size={80} /></span>
                <span className="mt-3 max-w-[120px] truncate font-mono text-xs font-semibold text-text-1">{e.username}</span>
              </div>
            ))}
            {reelItems.length === 0 && (
              <div className="flex h-full w-[min(90vw,900px)] flex-col items-center justify-center gap-2 text-center text-sm text-text-2">
                <Icon name="Users" className="h-7 w-7" />
                Entries spin here — start listening and have chat type <b className="font-mono text-gold">{g.keyword ?? "the keyword"}</b>.
              </div>
            )}
          </div>
        </div>

        <button
          onClick={draw}
          disabled={spinning || busy || finished || eligible.length === 0}
          className="press group relative mt-5 inline-flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-gold via-gold-hi to-gold text-bg-0 shadow-[0_14px_44px_-14px_var(--color-gold)] transition-[filter,transform] hover:brightness-105 disabled:opacity-50 disabled:shadow-none"
        >
          <span aria-hidden className="gw-shine pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/40 blur-md" />
          {spinning ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-bg-0/30 border-t-bg-0" />
              <span className="font-bang text-2xl tracking-wide">Rolling…</span>
            </>
          ) : (
            <>
              <Icon name="Sparkles" className="h-6 w-6" />
              <span className="font-bang text-2xl tracking-wide md:text-3xl">{finished ? "Round finished" : "Roll winner"}</span>
            </>
          )}
        </button>

        {data.winners.length > 0 && (
          <div className="relative mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="label mr-1">Winners</span>
            {data.winners.map((w) => (
              <span key={w.nonce} title={w.response === "no_show" ? "No response in chat — no prize" : w.response === "waiting" ? "Waiting for an answer in chat" : "Confirmed"}
                className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold ${w.response === "no_show" ? "border-danger/40 bg-danger/10 text-danger line-through" : w.response === "waiting" ? "border-line-strong text-text-1" : "border-gold/50 bg-gold/10 text-gold glow-gold"}`}>
                <span className={`h-6 w-6 overflow-hidden rounded-full ${w.response === "no_show" ? "grayscale" : ""}`}><Avatar src={w.avatar} name={w.username} size={24} /></span>
                {w.username}
                <Icon name={w.response === "no_show" ? "UserX" : w.response === "waiting" ? "Clock" : "Trophy"} className="h-3 w-3" />
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── entries ── */}
      <section className="surface p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <p className="flex items-baseline gap-2">
            <span className="font-bang text-2xl tracking-wide md:text-3xl">Entries</span>
            <span className="font-mono text-lg font-bold text-volt">{data.eligibleCount}</span>
            <span className="font-mono text-sm text-text-2">/ {data.entries.length}</span>
          </p>
          <div className="flex h-10 items-center gap-2 rounded-xl border border-line bg-bg-0/60 px-3 focus-within:border-gold">
            <Icon name="Search" className="h-4 w-4 text-text-2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entrant" className="h-full w-40 bg-transparent text-sm focus:outline-none" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-text-2">{data.entries.length === 0 ? "Nobody has entered yet." : "No matches."}</p>
        ) : (
          <div className="grid max-h-[28rem] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((e) => (
              <div key={e.username} className={`group flex items-center gap-3 rounded-xl border p-2.5 transition-colors ${e.excluded ? "border-danger/30 bg-danger/5 opacity-60" : e.eligible ? "border-line bg-bg-1/60 hover:border-volt/40" : "border-line bg-bg-1/30 opacity-70"}`}>
                <span className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ${e.eligible && !e.excluded ? "ring-volt/50" : "ring-line-strong"}`}><Avatar src={e.avatar} name={e.username} size={40} /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-mono text-sm font-semibold text-text-0">
                    <span className="truncate">{e.username}</span>
                    {e.isSubscriber && <span className="rounded bg-volt/15 px-1.5 text-[10px] font-bold uppercase text-volt">sub</span>}
                  </p>
                  <p className="text-[11px] text-text-2">{e.excluded ? "excluded" : e.eligible ? "eligible" : "not eligible yet"} · {e.createdAt ? new Date(e.createdAt.replace(" ", "T") + "Z").toLocaleTimeString() : "—"}</p>
                </div>
                <button onClick={() => exclude(e.username, !e.excluded)} disabled={g.poolLocked || spinning || busy}
                  className="press grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-text-2 opacity-60 transition-opacity hover:text-text-0 group-hover:opacity-100 disabled:opacity-30" title={e.excluded ? "Restore" : "Exclude"}>
                  <Icon name={e.excluded ? "RotateCcw" : "Ban"} className="h-4 w-4" />
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
          onReroll={() => { watchRef.current = null; setModalWinner(null); refresh(); draw(); }}
          onClose={() => { watchRef.current = null; setModalWinner(null); refresh(); }}
        />
      )}
    </div>
  );
}
