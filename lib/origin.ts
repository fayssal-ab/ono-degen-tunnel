// Netlify may expose an internal function URL while preserving the public
// Host header. Validate the browser origin against that public host too.
export function sameOrigin(request: Request, configuredSite?: string, production = false): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const candidate = new URL(origin);
    if (candidate.protocol !== "https:" && candidate.protocol !== "http:") return false;
    const allowed = new Set([new URL(request.url).origin]);
    if (configuredSite) allowed.add(new URL(configuredSite).origin);
    const host = request.headers.get("host");
    if (host) {
      const protocol = production ? "https:" : new URL(request.url).protocol;
      allowed.add(new URL(`${protocol}//${host}`).origin);
    }
    return allowed.has(candidate.origin);
  } catch { return false; }
}
