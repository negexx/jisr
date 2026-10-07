import "server-only";

import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { formatList, formatNumber } from "@/lib/journey/reasons";
import type { ProgramScope } from "@/lib/scholarships/sections";

export function ScholarshipProgrammes({
  scope,
  countryName,
}: {
  scope: ProgramScope;
  countryName: string;
}) {
  const locale = useLocale();
  const t = useTranslations("scholarshipsPage.programmes");
  const tProgram = useTranslations("program");

  return (
    <details data-testid="scholarship-programmes" className="group border-t border-border py-1">
      <summary className="flex min-h-11 cursor-pointer items-center text-base font-medium">
        {t("summary")}
      </summary>
      <div className="flex flex-col gap-3 pb-3">
        {scope.kind === "country" ? (
          <>
            <p className="max-w-prose text-base">
              {t("country", {
                count: scope.count,
                n: formatNumber(scope.count, locale) ?? String(scope.count),
                country: countryName,
              })}
            </p>
            <Link
              href="/matches"
              prefetch={false}
              className="inline-flex min-h-11 w-fit items-center text-base text-primary underline underline-offset-4"
            >
              {t("matchesLink")}
            </Link>
          </>
        ) : (
          <>
            {scope.groups.length === 0 && scope.without.length === 0 ? (
              <p className="text-base text-muted-foreground">{t("none")}</p>
            ) : null}
            {scope.groups.map((group) => (
              <div key={group.slug} className="flex flex-col gap-1">
                <p className="text-base font-medium">
                  {group.name === null ? (
                    tProgram("overview.institutionUnknown")
                  ) : group.city === null ? (
                    <bdi>{group.name}</bdi>
                  ) : (
                    tProgram.rich("header.institutionCity", {
                      institution: group.name,
                      city: group.city,
                      place: (chunks) => <bdi className="inline-block max-w-full">{chunks}</bdi>,
                    })
                  )}
                </p>
                <ul className="flex flex-col">
                  {group.programs.map((program) => (
                    <li key={program.slug}>
                      <Link
                        href={`/programs/${program.slug}`}
                        prefetch={false}
                        className="inline-flex min-h-11 items-center text-base text-primary underline underline-offset-4"
                      >
                        <bdi>{program.name}</bdi>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {scope.without.length === 0 ? null : (
              <p className="text-base text-muted-foreground">
                {t("without", {
                  institutions: formatList(scope.without, "conjunction", locale) ?? "",
                })}
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
