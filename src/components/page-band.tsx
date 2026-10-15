import type { CSSProperties, ReactNode } from "react";

// The band reuses the home hero's full-bleed breakout so a page header reads edge to edge inside the
// constrained <main>. The wash arrives as a CSS custom property on the element, like the hero mesh:
// no image asset, and it fades into the canvas so the band never shows a hard side edge.
const BAND_WASH =
  "radial-gradient(120% 150% at 12% -10%, oklch(0.9684 0.016 289.93) 0%, oklch(0.9807 0.0051 247.88) 45%, oklch(0.995 0.002 250) 78%)";

type PageBandProps = {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
  id?: string;
};

// Server component: every string arrives via props, so it renders under the root
// NextIntlClientProvider with `messages={null}`. It makes no freshness, clock or profile claim.
export function PageBand({ eyebrow, title, lead, children, id }: PageBandProps) {
  return (
    <section className="relative isolate mx-[calc(50%_-_50vw)] w-screen max-w-none overflow-hidden border-b border-border bg-background pt-10 pb-8 text-start md:pt-12 md:pb-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background-image:var(--jisr-band-wash)]"
        style={{ "--jisr-band-wash": BAND_WASH } as CSSProperties}
      />
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 md:px-6">
        {eyebrow === undefined ? null : (
          <p className="mb-3 text-sm font-medium tracking-[0.06em] text-primary uppercase">
            {eyebrow}
          </p>
        )}
        <h1 id={id} className="text-display font-light text-balance">
          {title}
        </h1>
        {lead === undefined ? null : (
          <p className="mt-4 max-w-[52ch] text-lg text-secondary-foreground">{lead}</p>
        )}
        {children === undefined || children === null ? null : (
          <div className="mt-6">{children}</div>
        )}
      </div>
    </section>
  );
}
