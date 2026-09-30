"use client";

// Client leaf: the student's result for this program, computed in the browser from the profile on this device and the published snapshot. Nothing personal reaches the server, the URL or the console. Needs the namespaces in PROGRAM_CLIENT_NAMESPACES.
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo } from "react";

import { MatchStatusBadge } from "@/components/match-status-badge";
import { ReasonList } from "@/components/reason-list";
import { Button } from "@/components/ui/button";
import type { CountryCode, Slug } from "@/data-schema/primitives";
import type { Profile } from "@/data-schema/profile";
import { estimateCost } from "@/domain/costs";
import { matchProgram } from "@/domain/match";
import { resolveRoute } from "@/domain/route";
import { scholarshipsForProgram } from "@/domain/scholarships";
import type { BudgetFit, MatchStatus } from "@/domain/types";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { todayIso } from "@/lib/clock";
import { groupOf, type MatchGroup, type RouteKey, routeKeyOf } from "@/lib/journey/matches-view";
import { describeReason, type ReasonView, ruleIndex } from "@/lib/journey/reasons";
import { useProfile } from "@/lib/profile/use-profile";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { shardsForProgram } from "@/lib/snapshot/plan";
import { type SnapshotRequest, useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

export type ProgramRef = { slug: Slug; country: CountryCode; field: Slug };

type PersonalResult = {
  group: MatchGroup;
  status: MatchStatus;
  routeKey: RouteKey;
  reasons: ReasonView[];
  budgetFit: BudgetFit;
  scholarships: Array<{ slug: string; name: string }>;
};

type Outcome = { kind: "result"; result: PersonalResult } | { kind: "missing" } | { kind: "error" };

function personalOutcome(
  profile: Profile,
  bundle: SnapshotBundle,
  slug: string,
  locale: AppLocale,
): Outcome {
  const program = bundle.programs.flatMap((shard) => shard.programs).find((p) => p.slug === slug);
  if (program === undefined) return { kind: "missing" };
  const core = bundle.core;
  if (core === undefined) return { kind: "error" };
  try {
    const now = todayIso();
    const routes = bundle.routes?.routes ?? [];
    const match = matchProgram({ profile, program, routes, reference: core, now });
    const cost = estimateCost({
      program,
      costProfiles: bundle.costProfiles.flatMap((shard) => shard.profiles),
      budget: profile.budget,
      now,
    });
    const context = {
      locale,
      core,
      text: bundle.text,
      rules: ruleIndex(program, resolveRoute(profile, program.country, routes)),
    };
    const scholarships = scholarshipsForProgram(
      profile,
      program,
      bundle.scholarships.flatMap((shard) => shard.scholarships),
    );
    return {
      kind: "result",
      result: {
        group: groupOf(match),
        status: match.status,
        routeKey: routeKeyOf(match),
        reasons: match.reasons.map((reason) => describeReason(reason, context)),
        budgetFit: cost.budgetFit,
        scholarships: scholarships.map((s) => ({ slug: s.slug, name: s.name })),
      },
    };
  } catch {
    // Deliberately silent: the error could carry profile values, and nothing personal is logged.
    return { kind: "error" };
  }
}

function useDomainText() {
  // Keys come from the domain view models (routeKeyOf, status), not literals, so the typed catalogue cannot check them.
  return useTranslations() as unknown as (key: string) => string;
}

function ResultSkeleton() {
  const block = "rounded-md bg-muted";
  return (
    <div aria-hidden="true" data-slot="personal-skeleton" className="flex h-48 flex-col gap-3">
      <div className={`${block} h-9 w-3/4`} />
      <div className={`${block} h-4 w-full`} />
      <div className={`${block} h-4 w-5/6`} />
      <div className={`${block} mt-2 h-4 w-1/2`} />
      <div className={`${block} h-4 w-full`} />
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("program.personal.error");
  return (
    <div role="alert" className="flex flex-col gap-2">
      <p className="text-base font-medium">{t("title")}</p>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Button type="button" variant="outline" className="mt-1 w-fit" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}

function ProfileCta() {
  const t = useTranslations("program.personal.cta");
  return (
    <div data-slot="personal-cta" className="flex flex-col gap-2">
      <p className="text-base font-medium">{t("title")}</p>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Button asChild className="mt-1 w-full sm:w-fit">
        <Link href="/profile">
          {t("action")}
          <ArrowRight data-icon="inline-end" aria-hidden="true" className="rtl:rotate-180" />
        </Link>
      </Button>
    </div>
  );
}

function UpdatedNotice() {
  const t = useTranslations("program.personal.updated");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted px-3 py-3">
      <output className="text-sm">{t("notice")}</output>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => window.location.reload()}
      >
        {t("reload")}
      </Button>
    </div>
  );
}

function ResultView({
  result,
  budgetProvided,
  scholarshipSlugs,
  keyFacts,
}: {
  result: PersonalResult;
  budgetProvided: boolean;
  scholarshipSlugs: readonly string[];
  keyFacts: ReactNode;
}) {
  const t = useTranslations("program.personal");
  const tFit = useTranslations("domain.budgetFit");
  const tDomain = useDomainText();
  const onPage = result.scholarships.filter((s) => scholarshipSlugs.includes(s.slug));

  return (
    <div data-slot="personal-result" data-group={result.group} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <MatchStatusBadge group={result.group} />
        <p className="text-base">{tDomain(`domain.status.hint.${result.status}`)}</p>
      </div>
      {keyFacts}
      {budgetProvided ? (
        <div data-slot="budget-fit" className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{t("budget")}</h3>
          <p className="text-base">{tFit(result.budgetFit)}</p>
          <p className="text-sm text-muted-foreground">{t("budgetNote")}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <h3 className="text-base font-semibold">{t("route")}</h3>
        <p data-testid="route-text" className="text-base">
          {tDomain(result.routeKey)}
        </p>
      </div>
      {scholarshipSlugs.length === 0 ? null : (
        <div data-slot="personal-scholarships" className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{t("scholarships")}</h3>
          {onPage.length === 0 ? (
            <p className="text-base">{t("scholarshipsNone")}</p>
          ) : (
            <ul className="flex flex-col">
              {onPage.map((s) => (
                <li key={s.slug}>
                  <a
                    href={`#scholarship-${s.slug}`}
                    className="flex min-h-11 items-center text-base text-primary underline underline-offset-4 md:min-h-8"
                  >
                    <bdi>{s.name}</bdi>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">{t("scholarshipsCaveat")}</p>
        </div>
      )}
      <ReasonList
        reasons={result.reasons}
        heading={t("reasons")}
        headingLevel={3}
        bodyHiddenFor={result.group === "foundation" ? ["route_foundation"] : []}
      />
    </div>
  );
}

// `client` is a test seam: production always uses the shared snapshot client.
export function PersonalMatch({
  program,
  snapshotVersion,
  scholarshipSlugs,
  locale,
  client,
  children,
}: {
  program: ProgramRef;
  // The snapshot the page was built from; a newer one in the browser means the page is out of date.
  snapshotVersion: string;
  // Scholarships listed on this page (their anchors are `scholarship-<slug>`).
  scholarshipSlugs: readonly string[];
  locale: AppLocale;
  client?: SnapshotClient;
  // Server-rendered key facts (deadline, cost), placed before the long reason list so a short sticky column still shows them.
  children?: ReactNode;
}) {
  const t = useTranslations("program.personal");
  const { state: profileState } = useProfile();
  const profile = profileState.status === "ok" ? profileState.profile : null;
  const country = profile?.credential.country ?? null;
  // The key names every input of the plan (this program and the credential country), per the useSnapshotBundle contract.
  const request: SnapshotRequest | null =
    profile === null
      ? null
      : {
          key: `program:${program.slug}:${country}`,
          plan: (manifest) => shardsForProgram(program, country, manifest),
        };
  const { state: snapshot, retry } = useSnapshotBundle(request, locale, client);
  const bundle = snapshot.status === "ready" ? snapshot.bundle : null;
  const outcome = useMemo(
    () =>
      profile === null || bundle === null
        ? null
        : personalOutcome(profile, bundle, program.slug, locale),
    [profile, bundle, program.slug, locale],
  );

  const withKeyFacts = (state: ReactNode) => (
    <div className="flex flex-col gap-5">
      {state}
      {children}
    </div>
  );

  if (profileState.status === "unhydrated") return withKeyFacts(<ResultSkeleton />);
  if (profile === null) return withKeyFacts(<ProfileCta />);
  if (snapshot.status === "error" || outcome?.kind === "error") {
    return withKeyFacts(<LoadError onRetry={retry} />);
  }
  if (bundle === null || outcome === null) {
    return withKeyFacts(
      <>
        <div aria-busy="true">
          <ResultSkeleton />
        </div>
        <output className="sr-only">{t("loading")}</output>
      </>,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {bundle.snapshotVersion === snapshotVersion ? null : <UpdatedNotice />}
      {outcome.kind === "missing" ? (
        withKeyFacts(<p className="text-base">{t("missingProgram")}</p>)
      ) : (
        <ResultView
          result={outcome.result}
          budgetProvided={profile.budget !== null}
          scholarshipSlugs={scholarshipSlugs}
          keyFacts={children}
        />
      )}
    </div>
  );
}
