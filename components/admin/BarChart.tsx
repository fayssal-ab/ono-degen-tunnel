"use client";

import { useEffect, useRef, useState } from "react";

// Single-series column chart for the admin dashboard (SVG, no library).
// One colour per chart (the card title names the series, so no legend);
// columns ≤ 24px with a 4px rounded top and a square base; hairline grid;
// compact y ticks; hover/focus tooltip with the value first; a table view
// below so nothing is hover-only.

export interface BarDatum { label: string; value: number; hint?: string }

const compact = (n: number, money: boolean) => {
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : abs >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`;
  return money ? `$${s}` : s;
};
const full = (n: number, money: boolean) =>
  money ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : n.toLocaleString("en-US");

/** 0 + 3 clean steps above the max. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return [0, step, step * 2, step * 3];
}

export function BarChart({ data, color, money = false, height = 200, labelEvery = 1 }: {
  data: BarDatum[]; color: string; money?: boolean; height?: number; labelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // draw at the container's real width so text stays 11px whatever the card size
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height, padL = 44, padB = 26, padT = 10, padR = 8;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(0, ...data.map((d) => d.value));
  const t = ticks(max);
  const top = t[t.length - 1];
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => padT + plotH - (top ? (v / top) * plotH : 0);
  const r = 4;

  return (
    <div ref={box} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block w-full" role="img" aria-label="Column chart">
        {t.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={padL - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-text-2" style={{ fontSize: 11 }}>{compact(v, money)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          const x = cx - barW / 2;
          const h = Math.max(0, y(0) - y(d.value));
          const rr = Math.min(r, h, barW / 2);
          // rounded top, square base
          const path = h <= 0 ? "" : `M${x},${y(0)} V${y(0) - h + rr} Q${x},${y(0) - h} ${x + rr},${y(0) - h} H${x + barW - rr} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + rr} V${y(0)} Z`;
          const active = hover === i;
          return (
            <g key={d.label} tabIndex={0} role="graphics-symbol" aria-label={`${d.label}: ${full(d.value, money)}`}
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              className="cursor-default outline-none">
              {/* hit target: the whole band */}
              <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent" />
              {path && <path d={path} fill={color} opacity={hover == null || active ? 1 : 0.45} style={{ transition: "opacity 120ms" }} />}
              {(i % Math.max(labelEvery, Math.ceil(46 / band)) === 0 || i === data.length - 1) && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-text-2" style={{ fontSize: 11 }}>{d.label}</text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" strokeWidth={1} />
      </svg>

      {hover != null && data[hover] && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-bg-0/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${((padL + band * hover + band / 2) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100}%`, marginTop: -6 }}>
          <p className="font-mono text-sm font-bold text-text-0">{full(data[hover].value, money)}</p>
          <p className="whitespace-nowrap text-text-2">{data[hover].hint ?? data[hover].label}</p>
        </div>
      )}

      <details className="mt-1 text-xs text-text-2">
        <summary className="cursor-pointer hover:text-text-1">Table</summary>
        <table className="mt-2 w-full">
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-b border-line/50 last:border-0">
                <td className="py-1">{d.hint ?? d.label}</td>
                <td className="py-1 text-right font-mono text-text-1">{full(d.value, money)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
