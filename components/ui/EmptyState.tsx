import Image from "next/image";
import { ButtonLink } from "./Button";

// Every empty state is designed, never a blank box (prompt §3.5). Illustration
// placeholder + one line + a CTA.
export function EmptyState({
  image,
  title,
  line,
  cta,
}: {
  image: string;
  title: string;
  line: string;
  cta?: { label: string; href: string; external?: boolean };
}) {
  return (
    <div className="surface flex flex-col items-center px-6 py-14 text-center">
      <Image
        src={image}
        alt=""
        width={220}
        height={165}
        className="mb-6 opacity-80"
        // placeholders are SVG; unoptimized avoids the optimizer round-trip
        unoptimized
      />
      <h3 className="text-xl">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-text-1">{line}</p>
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
