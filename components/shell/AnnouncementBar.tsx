import Link from "next/link";
import { getSetting } from "@/lib/settings";
import { Icon } from "@/components/ui/Icon";

// Site-wide banner, controlled from Admin → Settings. Renders nothing when
// unset. getSetting degrades to null if the DB isn't ready.
export async function AnnouncementBar() {
  const a = await getSetting("announcement");
  if (!a?.text) return null;

  const inner = (
    <span className="inline-flex items-center gap-2">
      <Icon name="Megaphone" className="h-3.5 w-3.5 text-bg-0" />
      {a.text}
      {a.href && <Icon name="ArrowRight" className="h-3.5 w-3.5 text-bg-0" />}
    </span>
  );

  return (
    <div className="bg-gold px-4 py-2 text-center text-xs font-medium text-bg-0">
      {a.href ? (
        <Link href={a.href} className="hover:underline">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}
