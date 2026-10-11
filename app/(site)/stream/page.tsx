import type { Metadata } from "next";
import { KICK_PLAYER_URL, KICK_CHANNEL, KICK_URL, STREAMER } from "@/lib/constants";
import { getSetting } from "@/lib/settings";
import { getStreamSchedule, WEEKDAYS } from "@/lib/stream";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, SectionHeading } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Stream", description: `Watch ${STREAMER} live on Kick.` };
import { notFound } from "next/navigation";
import { isPageEnabled } from "@/lib/pages";
export const dynamic = "force-dynamic";

export default async function StreamPage() {
  if (!(await isPageEnabled("/stream"))) notFound();
  const [kick, schedule] = await Promise.all([getSetting("kick_live"), getStreamSchedule()]);

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Community"
        title="Stream"
        lead={`Slots, bonus hunts and live giveaways with ${STREAMER}.`}
        right={<Badge tone={kick.live ? "volt" : "neutral"}>{kick.live ? `LIVE${kick.viewers ? ` · ${kick.viewers.toLocaleString()}` : ""}` : "Offline"}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* player */}
        <div className="surface overflow-hidden">
          {kick.live ? (
            <div className="aspect-video w-full">
              <iframe
                src={`${KICK_PLAYER_URL}`}
                title="Kick player"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          ) : (
            <div className="relative grid aspect-video w-full place-items-center overflow-hidden bg-gradient-to-br from-bg-2 to-bg-0">
              <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(60%_60%_at_50%_30%,color-mix(in_srgb,var(--color-cyan)_18%,transparent),transparent)]" />
              <div className="relative flex flex-col items-center gap-3 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-bg-1 text-text-1">
                  <Icon name="Radio" className="h-7 w-7" />
                </span>
                <p className="font-bang text-2xl tracking-wide">Offline right now</p>
                <a href={KICK_URL} target="_blank" rel="noreferrer" className="press inline-flex h-11 items-center gap-2 rounded-xl bg-volt px-5 text-sm font-semibold text-bg-0 hover:brightness-110">
                  <Icon name="Radio" className="h-4 w-4" /> Follow on Kick
                </a>
              </div>
            </div>
          )}
        </div>

        {/* chat */}
        <div className="surface hidden overflow-hidden lg:block">
          <div className="h-full min-h-[420px]">
            <iframe
              src={`https://kick.com/${KICK_CHANNEL}/chatroom`}
              title="Kick chat"
              className="h-full w-full"
            />
          </div>
        </div>
      </div>

      {/* schedule */}
      <section>
        <SectionHeading kicker="When to tune in" title="Weekly schedule" />
        {schedule.length === 0 ? (
          <p className="surface p-6 text-sm text-text-1">
            No fixed schedule posted — follow on Kick to get notified when {STREAMER} goes live.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {schedule.map((slot) => (
              <div key={slot.id} className="surface flex items-center gap-4 p-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-bg-3 font-mono text-sm font-bold text-gold">
                  {WEEKDAYS[slot.weekday]}
                </div>
                <div>
                  <p className="font-mono text-text-0">{slot.start_time}</p>
                  <p className="text-xs text-text-2">{slot.title || "Stream"} · {slot.timezone}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* clips */}
      <section>
        <SectionHeading kicker="Highlights" title="Latest clips" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <a
              key={i}
              href={KICK_URL}
              target="_blank"
              rel="noreferrer"
              className="surface press group relative grid aspect-video place-items-center overflow-hidden bg-gradient-to-br from-bg-2 to-bg-0"
            >
              <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(60%_60%_at_50%_50%,color-mix(in_srgb,var(--color-cyan)_20%,transparent),transparent)]" />
              <span className="relative grid h-12 w-12 place-items-center rounded-full border border-line bg-bg-1/80 text-text-0 transition-transform duration-300 group-hover:scale-110 group-hover:text-cyan">
                <Icon name="Play" className="h-5 w-5" />
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
