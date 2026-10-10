"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced to the server logs via Next's error reporting; keep client quiet.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-mono text-sm tracking-[0.3em] text-danger">ERROR</p>
      <h1 className="mt-4 text-3xl">The tunnel collapsed</h1>
      <p className="mt-3 max-w-sm text-text-1">
        Something broke on our end. Try again — if it keeps happening, let us know in Discord.
      </p>
      <Button variant="gold" className="mt-7" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
