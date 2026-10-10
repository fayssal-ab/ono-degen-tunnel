import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-mono text-sm tracking-[0.3em] text-text-2">404</p>
      <h1 className="mt-4 text-3xl">Lost in the tunnel</h1>
      <p className="mt-3 max-w-sm text-text-1">
        This page isn&rsquo;t on the map. Head back to the light.
      </p>
      <ButtonLink href="/" variant="gold" className="mt-7">
        Back to home
      </ButtonLink>
    </div>
  );
}
