"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
        return;
      }
      if (res.status === 401) setError("Wrong username or password.");
      else if (res.status === 429) setError("Too many attempts. Wait a few minutes.");
      else if (res.status === 403) setError("This site's address isn't allowed to sign in. Check the site URL configuration.");
      else setError("Sign-in is temporarily unavailable. Try again.");
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="u" className="label">Username</label>
        <input
          id="u"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="mt-1.5 h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm text-text-0 focus:outline-none focus:border-gold"
        />
      </div>
      <div>
        <label htmlFor="p" className="label">Password</label>
        <input
          id="p"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-1.5 h-11 w-full rounded-xl border border-line bg-bg-1 px-3 text-sm text-text-0 focus:outline-none focus:border-gold"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gold text-sm font-semibold text-bg-0 hover:bg-gold-hi disabled:opacity-50"
      >
        <Icon name="LogIn" className="h-4 w-4" />
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
