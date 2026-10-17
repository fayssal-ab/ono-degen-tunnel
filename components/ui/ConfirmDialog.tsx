"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

// Site-styled replacement for window.confirm / window.alert. One <ConfirmHost/>
// is mounted in the root layout; anywhere in the client code:
//   if (await confirmDialog("Delete this?")) …
//   await alertDialog("File too large");
// Destructive wording (delete, ban, remove…) gets the red treatment.
// Escape / backdrop = cancel, Enter = confirm.

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "gold";
  /** alert: a single OK button */
  alert?: boolean;
}
interface Request extends ConfirmOptions { resolve: (ok: boolean) => void }

let open: ((r: Request) => void) | null = null;

const DANGER = /\b(delete|remove|ban|void|reject|clear|unlink|reroll|reset|sign .* out|log out|exclude|cancel|undo)\b/i;

export function confirmDialog(o: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof o === "string" ? { message: o } : o;
  if (!open) return Promise.resolve(window.confirm(opts.message)); // host not mounted (should not happen)
  return new Promise((resolve) => open!({ ...opts, resolve }));
}

export async function alertDialog(message: string, title = "Heads up"): Promise<void> {
  await confirmDialog({ message, title, alert: true });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  const okBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    open = (r) => setReq(r);
    return () => { open = null; };
  }, []);

  useEffect(() => {
    if (!req) return;
    okBtn.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(false); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  function close(ok: boolean) {
    req?.resolve(ok);
    setReq(null);
  }

  if (!req) return null;
  const danger = req.tone ? req.tone === "danger" : !req.alert && DANGER.test(req.message);
  const title = req.title ?? (req.alert ? "Heads up" : danger ? "Are you sure?" : "Please confirm");
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
      <button aria-label="Cancel" tabIndex={-1} className="absolute inset-0 cursor-default bg-bg-0/75 backdrop-blur-sm" onClick={() => close(false)} />
      <form
        onSubmit={(e) => { e.preventDefault(); close(true); }}
        className="pop-in relative w-full max-w-md overflow-hidden rounded-[22px] border p-6 shadow-2xl"
        style={{
          borderColor: danger ? "color-mix(in srgb, var(--color-danger) 45%, transparent)" : "color-mix(in srgb, var(--color-gold) 40%, transparent)",
          background: `linear-gradient(160deg, color-mix(in srgb, ${danger ? "var(--color-danger)" : "var(--color-gold)"} 12%, var(--color-bg-1)), var(--color-bg-1) 60%)`,
        }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full blur-3xl" style={{ background: danger ? "rgba(255,77,94,0.18)" : "rgba(245,196,81,0.18)" }} />
        <div className="relative flex items-start gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${danger ? "bg-danger/15 text-danger" : "bg-gold/15 text-gold"}`}>
            <Icon name={req.alert ? "Info" : danger ? "TriangleAlert" : "CircleHelp"} className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p id="confirm-title" className="font-display text-lg font-extrabold text-text-0">{title}</p>
            <p id="confirm-msg" className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-text-1">{req.message}</p>
          </div>
        </div>
        <div className="relative mt-6 flex justify-end gap-2">
          {!req.alert && (
            <button type="button" onClick={() => close(false)} className="press inline-flex h-10 items-center rounded-xl border border-line-strong px-4 text-sm text-text-1 hover:text-text-0">
              {req.cancelLabel ?? "Cancel"}
            </button>
          )}
          <button ref={okBtn} type="submit"
            className={`press inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-bold ${danger ? "bg-danger text-white hover:brightness-110" : "bg-gold text-bg-0 hover:bg-gold-hi"}`}>
            {req.confirmLabel ?? (req.alert ? "OK" : danger ? "Yes, do it" : "Confirm")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
