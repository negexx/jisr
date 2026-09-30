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
  institution: "any" | "public" | "private";
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
  institution: "public",
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

  stepHeading(stepId: "bac" | "languages" | "preferences" | "budget" | "review"): Locator {
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

  async fillPreferences(values: ProfileFormValues): Promise<void> {
    const { page, t } = this;
    const fields = page.getByRole("group", {
      name: startsWith(t("profile.fields.fieldsOfStudy.legend")),
    });
    for (const box of await fields.getByRole("checkbox").all()) await box.check();
    const teaching = page.getByRole("group", {
      name: startsWith(t("profile.fields.studyLanguages.legend")),
    });
    for (const box of await teaching.getByRole("checkbox").all()) await box.check();
    await page
      .getByRole("radio", { name: t(`profile.fields.institution.${values.institution}`) })
      .check();
  }

  async advance(to: "languages" | "preferences" | "budget" | "review"): Promise<void> {
    await this.next().click();
    await expect(this.stepHeading(to)).toBeVisible();
  }

  // Walks the four steps and the review with valid values, stopping before the last button.
  async fillToReview(values: ProfileFormValues = JOURNEY_FORM): Promise<void> {
    await this.fillBac(values);
    await this.advance("languages");
    await this.fillLanguages(values);
    await this.advance("preferences");
    await this.fillPreferences(values);
    await this.advance("budget");
    await this.advance("review");
  }

  async submit(): Promise<void> {
    await this.page.getByRole("button", { name: this.t("profile.common.seeMatches") }).click();
    await expect(this.page).toHaveURL(new RegExp(`/${this.locale}/matches$`));
  }
}
