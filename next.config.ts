import type { NextConfig } from "next";

// Security headers (prompt §7.11). CSP allows the Kick player + Kick api/image
// hosts and nothing else third-party; everything else is self. `frame-src`
// carries player.kick.com so the stream embed works; `img-src` carries the
// Kick/casino avatar + slot-thumb hosts we actually load.
const csp = [
  "default-src 'self'",
  // Next injects small inline bootstrap scripts; 'unsafe-inline' is required
  // for the App Router runtime. No external script origins are allowed.
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://files.kick.com https://*.kick.com https://slot.report",
  "font-src 'self' data:",
  "frame-src https://player.kick.com https://kick.com",
  // wss://*.pusher.com = Kick's public chat socket (live giveaway listener)
  "connect-src 'self' https://api.kick.com https://id.kick.com https://kick.com wss://ws-us2.pusher.com wss://*.pusher.com",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      // The OBS overlay must be embeddable in a browser source, so it is
      // deliberately excluded from the global X-Frame-Options: DENY below by
      // ordering — Next applies the first matching source, so the overlay
      // rule comes first with a permissive frame policy.
      {
        source: "/overlay/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
