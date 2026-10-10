import { PageHeader } from "@/components/ui/PageHeader";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

// Shared renderer for policy-style pages (terms, privacy, RG).
export function LegalDoc({
  kicker,
  title,
  lead,
  updated,
  sections,
}: {
  kicker: string;
  title: string;
  lead?: string;
  updated?: string;
  sections: LegalSection[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader kicker={kicker} title={title} lead={lead} />
      {updated && <p className="text-xs text-text-2">Last updated {updated}</p>}
      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.heading} className="surface p-6">
            <h2 className="text-lg">{s.heading}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-text-1">
              {s.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
