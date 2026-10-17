import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

// "Poster" card: a big visual on top (a real image — slot art — or a colour
// gradient with a faded icon and a headline value), a status badge in the
// corner, a bold title underneath. Used for races, challenges, past periods
// and past rounds so every archive reads as a gallery.

export interface ArtCardProps {
  href?: string;
  /** two colours for the gradient + card tint */
  tone: [string, string];
  /** real picture (e.g. slot art); otherwise the gradient + icon */
  image?: string | null;
  icon?: string;
  /** big value written over the gradient (e.g. "$500") */
  headline?: string;
  badge?: { label: string; live?: boolean };
  title: string;
  sub?: ReactNode;
  footer?: ReactNode;
  dim?: boolean;
}

export function ArtCard({ href, tone: [a, b], image, icon = "Trophy", headline, badge, title, sub, footer, dim }: ArtCardProps) {
  const body = (
    <>
      <div className={`relative overflow-hidden rounded-2xl ${image ? "aspect-[3/4]" : "aspect-[16/10]"}`} style={image ? undefined : { background: `linear-gradient(140deg, ${a}, ${b})` }}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
            <div className="tunnel-grid absolute inset-0 opacity-25 mix-blend-overlay" />
            <Icon name={icon} strokeWidth={1.4} className="absolute -bottom-[14%] -right-[8%] h-[85%] w-[85%] rotate-[-14deg] text-black/20" />
            {headline && (
              <span className={`font-bang absolute inset-0 grid place-items-center px-4 text-center tracking-wide text-white [text-shadow:0_4px_0_rgba(0,0,0,0.35),0_10px_30px_rgba(0,0,0,0.35)] ${headline.length > 10 ? "text-3xl" : headline.length > 8 ? "text-4xl" : "text-5xl"}`}>
                {headline}
              </span>
            )}
          </>
        )}
        {badge && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/55 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white backdrop-blur">
            {badge.live && <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-volt" /></span>}
            {badge.label}
          </span>
        )}
      </div>
      <div className="px-1.5 pb-1 pt-3">
        <p className="truncate font-display text-lg font-extrabold text-text-0">{title}</p>
        {sub && <div className="mt-0.5 truncate text-sm text-text-1">{sub}</div>}
        {footer && <div className="mt-2 border-t border-white/10 pt-2 text-xs text-text-2">{footer}</div>}
      </div>
    </>
  );
  const cls = `group block rounded-[22px] border border-white/10 p-3 transition-[transform,border-color] duration-200 hover:-translate-y-1 ${dim ? "opacity-60 hover:opacity-100" : ""}`;
  const style = { background: `linear-gradient(180deg, color-mix(in srgb, ${a} 14%, var(--color-bg-1)), var(--color-bg-1))` };
  return href ? <Link href={href} className={cls} style={style}>{body}</Link> : <div className={cls} style={style}>{body}</div>;
}
