"use client";

import { useActionState, useState } from "react";
import { alertDialog } from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "./client";

// Manual provider CSV import: preview (server-validated, per-line errors),
// then import the exact same text. Nothing is written until the file is clean.

export interface ImportState {
  phase: "idle" | "preview" | "done" | "error";
  message?: string;
  rows?: number;
  total?: string;
  errors?: { line: number; message: string }[];
  sample?: { casino_id: string; username: string; wagered: string }[];
}

export function ManualImport({ periods, preview, commit }: {
  periods: { id: number; label: string }[];
  preview: (s: ImportState, f: FormData) => Promise<ImportState>;
  commit: (s: ImportState, f: FormData) => Promise<ImportState>;
}) {
  const [previewState, previewAction] = useActionState(preview, { phase: "idle" });
  const [commitState, commitAction] = useActionState(commit, { phase: "idle" });
  const [text, setText] = useState("");
  const [period, setPeriod] = useState(String(periods[0]?.id ?? ""));
  const clean = previewState.phase === "preview" && (previewState.errors?.length ?? 0) === 0 && (previewState.rows ?? 0) > 0;
  const input = "w-full rounded-xl border border-line bg-bg-1 px-3 text-sm focus:border-gold focus:outline-none";

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 900_000) { await alertDialog("That file is too large (max ~900 KB)."); return; }
    setText(await file.text());
  }

  return (
    <div className="space-y-3">
      <form action={previewAction} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Period (the CSV is that period&apos;s cumulative wagers)</span>
            <select name="period_id" value={period} onChange={(e) => setPeriod(e.target.value)} className={`mt-1 h-11 ${input}`}>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">CSV file</span>
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="mt-1 block w-full text-sm text-text-1" />
          </label>
        </div>
        <textarea name="csv" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"casino_id,username,wagered\n123,alice,1500.25"} className={`py-2 font-mono ${input}`} />
        <SubmitButton className="press inline-flex h-10 items-center rounded-xl border border-line-strong px-4 text-sm hover:border-gold hover:text-gold">Preview</SubmitButton>
      </form>

      {previewState.phase === "error" && <p className="text-sm text-danger">{previewState.message}</p>}
      {previewState.phase === "preview" && (
        <div className="rounded-xl border border-line bg-bg-1 p-3 text-sm">
          <p>{previewState.rows} valid row(s) · total ${previewState.total} · {previewState.errors?.length ?? 0} error(s)</p>
          {!!previewState.errors?.length && (
            <ul className="mt-2 max-h-48 overflow-y-auto font-mono text-xs text-danger">
              {previewState.errors.slice(0, 200).map((e) => <li key={e.line}>line {e.line}: {e.message}</li>)}
            </ul>
          )}
          {!!previewState.sample?.length && (
            <ul className="mt-2 font-mono text-xs text-text-2">
              {previewState.sample.map((r) => <li key={r.casino_id}>{r.casino_id} · {r.username} · {r.wagered}</li>)}
            </ul>
          )}
        </div>
      )}

      {clean && (
        <form action={commitAction}>
          <input type="hidden" name="period_id" value={period} />
          <input type="hidden" name="csv" value={text} />
          <SubmitButton className="press inline-flex h-10 items-center rounded-xl bg-gold px-4 text-sm font-semibold text-bg-0 hover:bg-gold-hi"
            confirm="Replace this period's manual wagers with this file?">Import {previewState.rows} rows</SubmitButton>
        </form>
      )}
      {commitState.phase !== "idle" && <p className={`text-sm ${commitState.phase === "done" ? "text-volt" : "text-danger"}`}>{commitState.message}</p>}
    </div>
  );
}
