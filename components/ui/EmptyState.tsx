import { ButtonLink } from "./Button";
import { Icon } from "./Icon";
import { bangSize } from "./bangSize";

// Empty state: a clean icon + a big "bang" title + one line + CTA. No drawn
// placeholder art. `image` is accepted but ignored (kept for call-site compat).
export function EmptyState({
  icon = "Sparkles",
  title,
  line,
  cta,
}: {
  image?: string;
  icon?: string;
  title: string;
  line: string;
  cta?: { label: string; href: string; external?: boolean };
}) {
  return (
    <div className="surface flex flex-col items-center px-6 py-16 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-bg-3 text-gold shadow-[0_0_28px_-10px_var(--color-gold)]">
        <Icon name={icon} className="h-8 w-8" />
      </span>
      <h3 className={`font-bang mt-6 max-w-full text-text-0 ${bangSize(title, "text-4xl md:text-5xl")}`}>{title}</h3>
      <p className="mt-3 max-w-md text-sm text-text-1 md:text-base">{line}</p>
      {cta &&
        (cta.external ? (
          <a
            href={cta.href}
            target="_blank"
            rel="noreferrer"
            className="press mt-6 inline-flex h-11 items-center rounded-xl bg-gold px-5 text-sm font-semibold text-bg-0 hover:bg-gold-hi"
          >
            {cta.label}
          </a>
        ) : (
          <ButtonLink href={cta.href} variant="gold" className="mt-6">
            {cta.label}
          </ButtonLink>
        ))}
    </div>
  );
}
