import { MatchesLayout } from "./matches-layout";

const BLOCK = "rounded-xl bg-secondary motion-safe:animate-pulse";

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <div className={`${BLOCK} h-6 w-3/4`} />
        <div className={`${BLOCK} h-4 w-1/2`} />
        <div className={`${BLOCK} h-8 w-48`} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className={`${BLOCK} h-14`} />
        <div className={`${BLOCK} h-14`} />
        <div className={`${BLOCK} h-24 md:col-span-2`} />
      </div>
      <div className={`${BLOCK} h-12 w-36`} />
    </div>
  );
}

// Decorative: the busy container that holds it, and the separate live status, carry the meaning.
export function MatchesSkeleton() {
  return (
    <MatchesLayout aside={<div aria-hidden="true" className={`${BLOCK} h-32`} />}>
      <div aria-hidden="true" className="flex flex-col gap-8">
        <div className={`${BLOCK} h-6 w-2/3`} />
        <div className="flex flex-col gap-4">
          <div className={`${BLOCK} h-7 w-1/2`} />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </MatchesLayout>
  );
}
