import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BRAND_NAME, STREAMER } from "@/lib/constants";
import "./globals.css";
import { ConfirmHost } from "@/components/ui/ConfirmDialog";

// Canonical origin for absolute OG/Twitter image URLs. Netlify injects the real
// site URL as process.env.URL (build + runtime), so share previews resolve to
// the correct domain even though NEXT_PUBLIC_SITE_URL is misconfigured. Falls
// back to the known production domain.
const CANONICAL = process.env.URL || "https://onodegentunnel.netlify.app";

// ALL fonts are self-hosted (woff2 bundled in the repo under app/fonts and
// emitted at build). No next/font/google → the build never reaches out to
// Google Fonts, which keeps CI/Netlify builds deterministic and offline-safe.
const clash = localFont({
  src: "./fonts/ClashDisplay-Variable.woff2",
  variable: "--font-clash",
  display: "swap",
  weight: "200 700",
});
const interTight = localFont({
  variable: "--font-inter-tight",
  display: "swap",
  src: [
    { path: "./fonts/InterTight-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InterTight-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/InterTight-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/InterTight-700.woff2", weight: "700", style: "normal" },
  ],
});
const jetbrainsMono = localFont({
  variable: "--font-jetbrains-mono",
  display: "swap",
  src: [{ path: "./fonts/JetBrainsMono-500.woff2", weight: "500", style: "normal" }],
});

// Graffiti letters for avatar fallbacks only (A–Z, 0–9 subset; OFL).
const tag = localFont({
  variable: "--font-tag",
  display: "swap",
  preload: false,
  src: [{ path: "./fonts/RubikWetPaint-tag.ttf", weight: "400", style: "normal" }],
});

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL),
  title: {
    default: `${BRAND_NAME} — ${STREAMER}'s rewards hub`,
    template: `%s · ${BRAND_NAME}`,
  },
  description:
    `Wager. Climb. Get paid. ${STREAMER}'s rewards tunnel — leaderboards, races, ` +
    `giveaways, free points games. Not a casino.`,
  applicationName: BRAND_NAME,
  openGraph: {
    title: `${BRAND_NAME} — ${STREAMER}'s rewards hub`,
    description: "Wager. Climb. Get paid. Leaderboards, giveaways & VIP. Sign up with the code.",
    url: CANONICAL,
    siteName: BRAND_NAME,
    type: "website",
    images: [{ url: "/og.png?v=2", width: 1200, height: 630, alt: BRAND_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} — ${STREAMER}'s rewards hub`,
    description: "Wager. Climb. Get paid. Sign up with the code.",
    images: ["/og.png?v=2"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/icon.png", shortcut: "/icon.png", apple: "/icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${clash.variable} ${interTight.variable} ${jetbrainsMono.variable} ${tag.variable}`}
      suppressHydrationWarning
    >
      <body>{children}<ConfirmHost /></body>
    </html>
  );
}
