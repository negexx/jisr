import { type FactKind, KindPill } from "@/components/kind-pill";
import { MatchStatusBadge } from "@/components/match-status-badge";

const FACT_KINDS: readonly FactKind[] = ["official", "estimate", "guidance"];

type TrustBandProps = {
  kicker: string;
  titleLead: string;
  titleAccent: string;
  body: string;
  labels: Record<FactKind, string>;
  legend: Record<FactKind, string>;
};

export function TrustBand({
  kicker,
  titleLead,
  titleAccent,
  body,
  labels,
  legend,
}: TrustBandProps) {
  return (
    <section
      aria-labelledby="trust-heading"
      className="relative isolate mx-[calc(50%_-_50vw)] w-screen max-w-none overflow-hidden bg-navy py-20 text-start md:py-24"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-10%] -top-[40%] -z-10 h-[120%]"
        style={{
          backgroundImage:
            "radial-gradient(40% 50% at 20% 10%, oklch(0.52 0.27 277 / 0.5), transparent 60%), radial-gradient(40% 50% at 88% 30%, oklch(0.72 0.2 330 / 0.28), transparent 60%)",
        }}
      />
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 md:grid-cols-2 md:items-center md:gap-16 md:px-6">
        <div>
          <span className="text-sm font-semibold tracking-[0.06em] text-[oklch(0.75_0.14_295)] uppercase">
            {kicker}
          </span>
          <h2
            id="trust-heading"
            className="mt-3.5 text-2xl leading-tight font-light tracking-tight text-balance text-[oklch(0.95_0.02_275)]"
          >
            {titleLead} <b className="font-semibold">{titleAccent}</b>
          </h2>
          <p className="mt-4 max-w-[44ch] text-base text-[oklch(0.8_0.04_275)]">{body}</p>
        </div>
        <div className="grid gap-3">
          {FACT_KINDS.map((kind) => (
            <div
              key={kind}
              className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-white/12 bg-white/5 px-4 py-3.5 backdrop-blur-sm"
            >
              <KindPill kind={kind}>{labels[kind]}</KindPill>
              <span className="text-sm text-[oklch(0.8_0.04_275)]">{legend[kind]}</span>
            </div>
          ))}
          {/* Illustrative legend: the three match states as icon + colour + words, not a computed result. */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/12 bg-white/5 px-4 py-3.5 backdrop-blur-sm">
            <MatchStatusBadge group="ok" size="sm" />
            <MatchStatusBadge group="check" size="sm" />
            <MatchStatusBadge group="failed" size="sm" />
          </div>
        </div>
      </div>
    </section>
  );
}
