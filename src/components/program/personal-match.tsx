"use client";

// Client leaf: the student's result for this program, computed in the browser from the profile on this device and the published snapshot. Nothing personal reaches the server, the URL or the console. Needs the namespaces in PROGRAM_CLIENT_NAMESPACES.
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { MatchStatusBadge } from "@/components/match-status-badge";
import { ReasonList } from "@/components/reason-list";
import { ReportSnapshot } from "@/components/report-outdated/report-context";
import { Button } from "@/components/ui/button";
import type { MatchFilters } from "@/data-schema/match-filters";
import type { CountryCode, Slug } from "@/data-schema/primitives";
import type { Profile } from "@/data-schema/profile";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { useSessionHint } from "@/lib/auth/session-hint";
import { todayIso } from "@/lib/clock";
import { getLocalStorage } from "@/lib/local-storage";
import { readMatchFilters } from "@/lib/matches/filter-store";
import { EMPTY_MATCH_FILTERS } from "@/lib/matches/filters";
import { useProfile } from "@/lib/profile/use-profile";
import type { SnapshotBundle, SnapshotClient } from "@/lib/snapshot/client";
import { shardsForProgram } from "@/lib/snapshot/plan";
import { type SnapshotRequest, useSnapshotBundle } from "@/lib/snapshot/use-snapshot";

import type { Outcome, PersonalResult } from "./personal-outcome";

export type ProgramRef = { slug: Slug; country: CountryCode; field: Slug };

// "load_failed": the matching code itself could not be downloaded (a network problem: Retry helps).
type Computed = {
  bundle: SnapshotBundle;
  profile: Profile;
  locale: AppLocale;
  outcome: Outcome | { kind: "load_failed" };
};

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

function Loading() {
  const t = useTranslations("program.personal");
  return (
    <>
      <div aria-busy="true">
        <ResultSkeleton />
      </div>
      <output className="sr-only">{t("loading")}</output>
    </>
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

function ComputeError() {
  const t = useTranslations("program.personal.computeError");
  return (
    <div role="alert" className="flex flex-col gap-2">
      <p className="text-base font-medium">{t("title")}</p>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
    </div>
  );
}

function ProfileCta() {
  const t = useTranslations("program.personal.cta");
  const signedIn = useSessionHint();
  return (
    <div data-slot="personal-cta" className="flex flex-col gap-2">
      <p className="text-base font-medium">{t("title")}</p>
      <p className="text-sm text-muted-foreground">
        {t(signedIn ? "descriptionSignedIn" : "description")}
      </p>
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

function ResultHead({ result }: { result: PersonalResult }) {
  const tDomain = useDomainText();
  return (
    <div className="flex flex-col gap-2">
      <MatchStatusBadge group={result.group} />
      <p className="text-base">{tDomain(`domain.status.hint.${result.status}`)}</p>
    </div>
  );
}

function ResultDetails({
  result,
  budgetProvided,
  scholarshipSlugs,
}: {
  result: PersonalResult;
  budgetProvided: boolean;
  scholarshipSlugs: readonly string[];
}) {
  const t = useTranslations("program.personal");
  const tFit = useTranslations("domain.budgetFit");
  const tDomain = useDomainText();
  const onPage = result.scholarships.filter((s) => scholarshipSlugs.includes(s.slug));

  return (
    <>
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
    </>
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
  // Server-rendered key facts (deadline, cost), placed before the long reason list so a short sticky
  // column still shows them. They keep one tree position in every state, so they never remount.
  children?: ReactNode;
}) {
  const t = useTranslations("program.personal");
  const { state: profileState } = useProfile();
  const profile = profileState.status === "ok" ? profileState.profile : null;
  // The budget is a transient filter, read once after mount; it only annotates the cost, never renders
  // before the result is computed, so the server and first client render are unaffected.
  const [filters] = useState<MatchFilters>(() => {
    const storage = getLocalStorage();
    return storage === null ? EMPTY_MATCH_FILTERS : readMatchFilters(storage);
  });
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

  const [computed, setComputed] = useState<Computed | null>(null);
  useEffect(() => {
    if (profile === null || bundle === null) return;
    let current = true;
    import("./personal-outcome").then(
      (module) => {
        const outcome = module.personalOutcome(
          profile,
          filters.budget,
          bundle,
          program.slug,
          locale,
          todayIso(),
        );
        if (current) setComputed({ bundle, profile, locale, outcome });
      },
      () => {
        if (current) setComputed({ bundle, profile, locale, outcome: { kind: "load_failed" } });
      },
    );
    return () => {
      current = false;
    };
  }, [profile, filters, bundle, program.slug, locale]);
  // Only a result computed for exactly this profile, bundle and locale is shown.
  const outcome =
    computed !== null &&
    computed.bundle === bundle &&
    computed.profile === profile &&
    computed.locale === locale
      ? computed.outcome
      : null;

  let head: ReactNode;
  let details: ReactNode = null;
  if (profileState.status === "unhydrated") head = <ResultSkeleton />;
  else if (profile === null) head = <ProfileCta />;
  else if (snapshot.status === "error" || outcome?.kind === "load_failed") {
    head = <LoadError onRetry={retry} />;
  } else if (outcome === null) head = <Loading />;
  else if (outcome.kind === "compute_error") head = <ComputeError />;
  else if (outcome.kind === "missing") {
    head = <p className="text-base">{t("missingProgram")}</p>;
  } else {
    head = <ResultHead result={outcome.result} />;
    details = (
      <ReportSnapshot version={bundle?.snapshotVersion ?? null}>
        <ResultDetails
          result={outcome.result}
          budgetProvided={filters.budget !== null}
          scholarshipSlugs={scholarshipSlugs}
        />
      </ReportSnapshot>
    );
  }
  const result = outcome?.kind === "result" ? outcome.result : null;

  return (
    <div
      data-slot={result === null ? "personal-match" : "personal-result"}
      data-group={result?.group}
      className="flex flex-col gap-5"
    >
      {bundle !== null && outcome !== null && bundle.snapshotVersion !== snapshotVersion ? (
        <UpdatedNotice />
      ) : null}
      {head}
      {children}
      {details}
    </div>
  );
}
