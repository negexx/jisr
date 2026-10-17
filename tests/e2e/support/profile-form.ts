import { expect, type Locator, type Page } from "@playwright/test";

import type { E2eLocale } from "./locales";
import { languageLabel, startsWith, type Translate, translatorFor } from "./messages";

// Synthetic values of the e2e fixture (tests/fixtures/data/e2e-journey); option values are data
// identifiers, never copy.
export type ProfileFormValues = {
  nationality: string;
  credentialCountry: string;
  credentialType: string;
  track: string;
  overall: string;
  subjects: ReadonlyArray<{ subject: string; grade: string }>;
  years: string;
  frenchLevel: string;
  frenchCertificate: string | null;
  englishLevel: "unknown" | string;
};

// The former preference fields, now the transient filters of My matches. Values are data
// identifiers, never copy.
export type FilterFormValues = {
  fields?: readonly string[];
  studyLanguages?: readonly string[];
  destinations?: readonly string[];
  institution?: "any" | "public" | "private";
  budget?: { amount: string; currency?: "EUR" | "MAD"; period?: "month" | "year" } | null;
};

export const JOURNEY_FORM: ProfileFormValues = {
  nationality: "XA",
  credentialCountry: "XA",
  credentialType: "xx-test-cred",
  track: "xx-test-track-sci",
  overall: "14",
  subjects: [{ subject: "xx-test-subject-math", grade: "14" }],
  years: "0",
  frenchLevel: "B2",
  frenchCertificate: "xx-test-cert-fr",
  englishLevel: "unknown",
};

export class ProfileFormDriver {
  readonly t: Translate;

  constructor(
    readonly page: Page,
    readonly locale: E2eLocale,
  ) {
    this.t = translatorFor(locale);
  }

  async open(): Promise<void> {
    await this.page.goto(`/${this.locale}/profile`);
    await expect(this.page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(this.nationality()).toBeVisible();
  }

  nationality(): Locator {
    return this.page.getByRole("combobox", {
      name: startsWith(this.t("profile.fields.nationality.label")),
    });
  }

  credentialCountry(): Locator {
    return this.page.getByRole("combobox", {
      name: startsWith(this.t("profile.fields.credentialCountry.label")),
    });
  }

  overallGrade(): Locator {
    return this.page.getByRole("textbox", {
      name: startsWith(this.t("profile.fields.overall.label")),
    });
  }

  stepHeading(stepId: "bac" | "languages" | "review"): Locator {
    return this.page.getByRole("heading", {
      level: 2,
      name: this.t(`profile.steps.${stepId}.title`),
    });
  }

  next(): Locator {
    return this.page.getByRole("button", { name: this.t("profile.common.next") });
  }

  errorSummary(): Locator {
    return this.page.getByRole("heading", {
      level: 2,
      name: this.t("profile.errors.summaryTitle"),
    });
  }

  async fillBac(values: ProfileFormValues): Promise<void> {
    const { page, t } = this;
    await this.nationality().selectOption(values.nationality);
    await this.credentialCountry().selectOption(values.credentialCountry);
    await page
      .getByRole("combobox", { name: startsWith(t("profile.fields.credentialType.label")) })
      .selectOption(values.credentialType);
    await page
      .getByRole("combobox", { name: startsWith(t("profile.fields.track.label")) })
      .selectOption(values.track);
    await page.getByRole("radio", { name: t("profile.fields.status.obtained") }).check();
    await this.overallGrade().fill(values.overall);

    for (const [index, row] of values.subjects.entries()) {
      await page.getByRole("button", { name: t("profile.fields.subjects.add") }).click();
      const group = page.getByRole("group", {
        name: t("profile.fields.subjects.rowTitle", { number: String(index + 1) }),
      });
      await group
        .getByRole("combobox", { name: startsWith(t("profile.fields.subjects.subject")) })
        .selectOption(row.subject);
      await group
        .getByRole("textbox", { name: startsWith(t("profile.fields.subjects.grade")) })
        .fill(row.grade);
    }
    await page
      .getByRole("combobox", { name: startsWith(t("profile.fields.years.label")) })
      .selectOption(values.years);
  }

  languageRow(code: "fr" | "en"): Locator {
    return this.page.getByRole("group", { name: languageLabel(code, this.locale) });
  }

  async fillLanguages(values: ProfileFormValues): Promise<void> {
    const { t } = this;
    const french = this.languageRow("fr");
    await french
      .getByRole("combobox", { name: startsWith(t("profile.fields.level.label")) })
      .selectOption(values.frenchLevel);
    if (values.frenchCertificate !== null) {
      await french
        .getByRole("combobox", { name: startsWith(t("profile.fields.certificate.label")) })
        .selectOption(values.frenchCertificate);
    }
    const english = this.languageRow("en");
    const englishLevel = english.getByRole("combobox", {
      name: startsWith(t("profile.fields.level.label")),
    });
    if (values.englishLevel === "unknown") {
      await englishLevel.selectOption({ label: t("profile.fields.levels.unknown") });
    } else {
      await englishLevel.selectOption(values.englishLevel);
    }
  }

  async advance(to: "languages" | "review"): Promise<void> {
    await this.next().click();
    await expect(this.stepHeading(to)).toBeVisible();
  }

  // Walks the two question steps and the review with valid values, stopping before the last button.
  async fillToReview(values: ProfileFormValues = JOURNEY_FORM): Promise<void> {
    await this.fillBac(values);
    await this.advance("languages");
    await this.fillLanguages(values);
    await this.advance("review");
  }

  async submit(): Promise<void> {
    await this.page.getByRole("button", { name: this.t("profile.common.seeMatches") }).click();
    await expect(this.page).toHaveURL(new RegExp(`/${this.locale}/matches$`));
  }

  filterPanel(): Locator {
    return this.page
      .locator("summary")
      .filter({ hasText: this.t("matches.filters.toggle") })
      .locator("xpath=..");
  }

  filterGroup(legend: string): Locator {
    return this.page.getByRole("group", { name: startsWith(legend) });
  }

  async openFilters(): Promise<void> {
    const panel = this.filterPanel();
    if ((await panel.getAttribute("open")) === null) await panel.locator("summary").click();
    await expect(panel).toHaveAttribute("open", "");
  }

  async chooseFilters(group: Locator, values: readonly string[]): Promise<void> {
    for (const box of await group.getByRole("checkbox").all()) {
      const value = await box.getAttribute("value");
      if (value === null) continue;
      const wanted = values.includes(value);
      if ((await box.isChecked()) !== wanted) await box.setChecked(wanted);
    }
  }

  // Sets only the groups named in `values`: the others keep the student's current choice.
  async fillFilters(values: FilterFormValues): Promise<void> {
    const { t } = this;
    await this.openFilters();
    if (values.fields !== undefined) {
      await this.chooseFilters(this.filterGroup(t("matches.filters.field.legend")), values.fields);
    }
    if (values.studyLanguages !== undefined) {
      await this.chooseFilters(
        this.filterGroup(t("matches.filters.studyLanguage.legend")),
        values.studyLanguages,
      );
    }
    if (values.destinations !== undefined) {
      await this.chooseFilters(
        this.filterGroup(t("matches.filters.destination.legend")),
        values.destinations,
      );
    }
    if (values.institution !== undefined) {
      await this.filterGroup(t("matches.filters.institution.legend"))
        .getByRole("radio", { name: t(`matches.filters.institution.${values.institution}`) })
        .check();
    }
    if (values.budget !== undefined) {
      await this.page
        .getByRole("textbox", {
          name: startsWith(t("matches.filters.budget.amount.label")),
        })
        .fill(values.budget?.amount ?? "");
      if (values.budget !== null) {
        if (values.budget.currency !== undefined) {
          await this.page
            .getByRole("combobox", {
              name: startsWith(t("matches.filters.budget.currency.label")),
            })
            .selectOption(values.budget.currency);
        }
        if (values.budget.period !== undefined) {
          await this.page
            .getByRole("combobox", {
              name: startsWith(t("matches.filters.budget.period.label")),
            })
            .selectOption(values.budget.period);
        }
      }
    }
  }

  async clearFilters(): Promise<void> {
    await this.page
      .getByRole("button", { name: this.t("matches.filters.clear") })
      .first()
      .click();
    await expect(this.page).not.toHaveURL(/\?/);
  }
}
