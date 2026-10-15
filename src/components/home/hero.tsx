import { ArrowRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { HomeMatchesLink } from "@/components/home-matches-link";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Component-scoped keyframes keep the decorative drift out of the global token file. The mesh
// colours and its soft edge mask arrive as CSS custom properties on the element below, so the
// gradient stays token-adjacent and no image asset is added.
const MESH_CSS = `
.jisr-mesh{background-image:var(--jisr-mesh);-webkit-mask-image:var(--jisr-mesh-mask);mask-image:var(--jisr-mesh-mask);filter:saturate(120%);animation:jisr-mesh-drift 22s ease-in-out infinite alternate}
@keyframes jisr-mesh-drift{from{transform:translate3d(-1.5%,-1%,0) scale(1.02)}to{transform:translate3d(2%,1.5%,0) scale(1.06)}}
@media (prefers-reduced-motion: reduce){.jisr-mesh{animation:none}}
`;

const MESH_GRADIENTS = [
  "radial-gradient(38% 46% at 18% 22%, oklch(0.5211 0.2679 277.43 / 0.42), transparent 62%)",
  "radial-gradient(34% 44% at 72% 8%, oklch(0.7 0.16 295 / 0.5), transparent 60%)",
  "radial-gradient(30% 42% at 92% 34%, oklch(0.72 0.2 330 / 0.34), transparent 60%)",
  "radial-gradient(40% 40% at 48% 44%, oklch(0.62 0.22 278 / 0.3), transparent 66%)",
].join(", ");

// A radial fade makes the mesh fall off on every side, so its constrained width never shows a hard edge.
const MESH_MASK = "radial-gradient(130% 115% at 50% 32%, black 42%, transparent 100%)";

type HeroProps = {
  eyebrow: string;
  titleLead: string;
  titleAccent: string;
  lead: string;
  cta: string;
  ctaNote: ReactNode;
  matchesCta: string;
  scholarshipsCta: string;
  demo?: ReactNode;
};

export function Hero({
  eyebrow,
  titleLead,
  titleAccent,
  lead,
  cta,
  ctaNote,
  matchesCta,
  scholarshipsCta,
  demo,
}: HeroProps) {
  return (
    <section className="relative isolate mx-[calc(50%_-_50vw)] w-screen max-w-none overflow-hidden bg-background pt-14 pb-10 text-start md:pt-20 md:pb-14">
      <style>{MESH_CSS}</style>
      <div
        aria-hidden="true"
        className="jisr-mesh pointer-events-none absolute inset-x-[-6%] -top-[20%] -z-10 h-[130%]"
        style={
          {
            "--jisr-mesh": MESH_GRADIENTS,
            "--jisr-mesh-mask": MESH_MASK,
          } as CSSProperties
        }
      />
      <div
        className={cn(
          "relative z-10 mx-auto grid w-full max-w-5xl gap-11 px-4 md:px-6",
          demo !== undefined && demo !== null
            ? "md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:items-center md:gap-14"
            : null,
        )}
      >
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200 motion-safe:ease-[cubic-bezier(.2,.8,.2,1)]">
          <span className="inline-flex items-center rounded-full border border-primary/25 bg-background/70 px-3.5 py-2 text-sm font-medium text-accent-foreground backdrop-blur">
            {eyebrow}
          </span>
          <h1 className="mt-5 text-display font-light text-balance">
            {titleLead} <b className="font-semibold">{titleAccent}</b>
          </h1>
          <p className="mt-4 max-w-[46ch] text-lg text-secondary-foreground">{lead}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/profile">
                {cta}
                <ArrowRight data-icon="inline-end" className="rtl:rotate-180" aria-hidden="true" />
              </Link>
            </Button>
            <HomeMatchesLink label={matchesCta} />
          </div>
          <p className="mt-3.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
            {ctaNote}
          </p>
          <p className="mt-2">
            <Link
              href="/scholarships"
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-1 text-base font-medium text-primary underline underline-offset-4"
            >
              {scholarshipsCta}
              <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
            </Link>
          </p>
        </div>
        {demo !== undefined && demo !== null ? <div className="relative">{demo}</div> : null}
      </div>
    </section>
  );
}
