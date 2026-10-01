import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import type { Profile } from "@/data-schema/profile";
import type { CoreShard } from "@/data-schema/snapshot";
import type { AppLocale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import type { TextLookup } from "@/lib/snapshot/text";

import { EditProfileLink } from "./matches-states";

// A name the snapshot lacks falls back to the code, never to an empty chip.
function nameOf(key: string | undefined, fallback: string, text: TextLookup): string {
  if (key === undefined) return fallback;
  return text(key)?.text ?? fallback;
}

function Chip({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <li
      className={`rounded-full border border-border bg-background px-3 py-1 text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}
    >
      {children}
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 lg:flex-col lg:items-start">
      <dt className="sr-only text-sm font-medium text-muted-foreground lg:not-sr-only">{label}</dt>
      <dd>
        <ul className="flex flex-wrap gap-1.5">{children}</ul>
      </dd>
    </div>
  );
}

export function ProfileSummary({
  profile,
  core,
  text,
  locale,
}: {
  profile: Profile;
  core: CoreShard;
  text: TextLookup;
  locale: AppLocale;
}) {
  const t = useTranslations("matches.summary");
  const headingId = useId();
  const { budget } = profile;

  // Phone: one wrapping strip of chips (labels stay for screen readers) and a small edit link.
  // From lg: the labelled column, title and edit link on the first row.
  return (
    <aside
      aria-labelledby={headingId}
      className="flex flex-wrap items-center gap-2 rounded-xl bg-muted p-3 lg:grid lg:grid-cols-1 lg:gap-y-3 lg:p-4"
    >
      <h2 id={headingId} className="sr-only text-base font-semibold lg:not-sr-only">
        {t("title")}
      </h2>
      <dl className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-3">
        <Row label={t("fields")}>
          {profile.fields.map((slug) => (
            <Chip key={slug}>
              <bdi>
                {nameOf(core.fields.find((field) => field.slug === slug)?.name, slug, text)}
              </bdi>
            </Chip>
          ))}
        </Row>
        <Row label={t("destinations")}>
          {profile.destinations.length === 0 ? (
            <Chip muted>{t("allCountries")}</Chip>
          ) : (
            profile.destinations.map((code) => (
              <Chip key={code}>
                <bdi>
                  {nameOf(
                    core.countries.find((country) => country.code === code)?.name,
                    code,
                    text,
                  )}
                </bdi>
              </Chip>
            ))
          )}
        </Row>
        <Row label={t("budget")}>
          {budget === null ? (
            <Chip muted>{t("budgetNotSet")}</Chip>
          ) : (
            <Chip>
              {t.rich(`budgetPer.${budget.period}`, {
                amount: formatMoney(budget.amountMinor, budget.currency, locale),
                // The amount keeps its own direction inside Arabic text.
                money: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
              })}
            </Chip>
          )}
        </Row>
      </dl>
      <div className="lg:pt-1">
        <EditProfileLink size="sm" />
      </div>
    </aside>
  );
}
