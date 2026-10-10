import type { Metadata } from "next";
import Image from "next/image";
import { KICK_PLAYER_URL, KICK_CHANNEL, KICK_URL, STREAMER } from "@/lib/constants";
import { ASSETS } from "@/lib/assets";
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
            <div className="relative aspect-video w-full">
              <Image src={ASSETS.stream.offline} alt="" fill unoptimized className="object-cover opacity-70" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-0/40 text-center">
                <p className="font-display text-xl">Offline right now</p>
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
              className="surface press group relative aspect-video overflow-hidden"
            >
              <Image src={ASSETS.stream.clip(i + 1)} alt="" fill unoptimized className="object-cover transition-transform duration-300 group-hover:scale-105" />
              <span className="absolute inset-0 grid place-items-center bg-bg-0/30">
                <Icon name="Play" className="h-10 w-10 text-text-0/90" />
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
