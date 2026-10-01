import { describe, expect, it } from "vitest";

import {
  buildCheckPrompt,
  CHECKER_INSTRUCTION,
  type Claim,
  checkVerified,
  claimText,
  contextAround,
} from "../../../scripts/import/checker";
import type { Completion } from "../../../scripts/import/llm";
import type { Verified } from "../../../scripts/import/proposals";

describe("claimText", () => {
  it("states each fact as a plain sentence the checker can judge", () => {
    expect(claimText("durationYears", 3)).toBe("The programme lasts 3 years.");
    expect(claimText("teachingLanguages", ["en", "de"])).toBe(
      "The programme is taught in: en, de.",
    );
    expect(claimText("tuition", { amountMinor: 1465000, currency: "EUR", period: "year" })).toBe(
      "The tuition fee for a student from outside the EU/EEA is 14650 EUR per year.",
    );
    expect(claimText("tuition", { amountMinor: 0, currency: "EUR", period: "year" })).toBe(
      "There is no tuition fee for a student from outside the EU/EEA.",
    );
    expect(claimText("applicationChannel", "de-uni-assist-vpd")).toMatch(/uni-assist/i);
  });

  it("lists the dates of an intake with what each one is", () => {
    const text = claimText("intakes", [
      { startDate: "2027-09-01", applicationOpens: null, applicationDeadline: "2027-05-01" },
    ]);
    expect(text).toContain("2027-09-01");
    expect(text).toContain("start");
    expect(text).toContain("2027-05-01");
    expect(text).toContain("deadline");
  });
});

describe("contextAround", () => {
  const page = `${"before ".repeat(100)}The programme is taught in English. ${"after ".repeat(100)}`;

  it("returns the text around the quote, including the quote", () => {
    const context = contextAround("The programme is taught in English.", page, 50);
    expect(context).not.toBeNull();
    expect(context).toContain("the programme is taught in english.");
    expect(context?.length).toBeLessThan(200);
  });

  it("is null when the quote is not on the page", () => {
    expect(contextAround("a sentence that is not there at all", page, 50)).toBeNull();
  });
});

describe("buildCheckPrompt", () => {
  const claims: Claim[] = [
    {
      id: 1,
      fact: "durationYears",
      statement: "The programme lasts 3 years.",
      excerpt: "bachelor 3 years",
    },
    {
      id: 2,
      fact: "teachingLanguages",
      statement: "The programme is taught in: en.",
      excerpt: "english",
    },
  ];

  it("names the programme and the applicant and numbers every claim", () => {
    const { system, user } = buildCheckPrompt(
      { name: "Computer Science", institution: "Uni X" },
      claims,
    );
    expect(system).toMatch(/Moroccan/);
    expect(user).toContain("Computer Science");
    expect(user).toContain("Uni X");
    expect(user).toContain("[1]");
    expect(user).toContain("[2]");
    expect(user).toContain("bachelor 3 years");
  });
});

const completion = (text: string): Completion => ({
  model: "fake",
  text,
  usage: { input: 10, cached: 0, output: 5 },
  costUsd: 0,
  latencyMs: 1,
  ttftMs: 1,
  finishReason: "stop",
});
const model = { id: "fake", wire: "chat" as const, price: { input: 0, output: 0, cached: 0 } };
const meta = { name: "Computer Science", institution: "Uni X" };
const page = "Computer Science is a Bachelor of 3 years. It is taught in English at Uni X.";
const evidence = (quote: string) => [{ url: "https://x.example/p", quote }];
const verified = (): Verified => ({
  programmePage: "https://x.example/p",
  facts: {
    durationYears: { value: 3, evidence: evidence("is a Bachelor of 3 years.") },
    teachingLanguages: { value: ["en"], evidence: evidence("It is taught in English at Uni X.") },
  },
  rejected: [],
});

describe("checkVerified", () => {
  it("keeps the facts the checker supports and removes the others, saying why", async () => {
    const out = await checkVerified({
      verified: verified(),
      meta,
      model,
      session: "s",
      getText: async () => page,
      completeFn: async () =>
        completion(
          '[{"id":1,"verdict":"supports","reason":"states 3 years"},{"id":2,"verdict":"contradicts","reason":"about another track"}]',
        ),
    });
    expect(Object.keys(out.verified.facts)).toEqual(["durationYears"]);
    expect(out.verified.rejected).toEqual([
      { fact: "teachingLanguages", reason: "checker: contradicts (about another track)" },
    ]);
    expect(out.error).toBeNull();
  });

  it("treats a claim the checker did not answer as unclear", async () => {
    const out = await checkVerified({
      verified: verified(),
      meta,
      model,
      session: "s",
      getText: async () => page,
      completeFn: async () => completion('[{"id":1,"verdict":"supports","reason":"ok"}]'),
    });
    expect(Object.keys(out.verified.facts)).toEqual(["durationYears"]);
    expect(out.verified.rejected[0]?.reason).toMatch(/unclear/);
  });

  it("fails closed: an unusable answer removes every fact and reports the error", async () => {
    const out = await checkVerified({
      verified: verified(),
      meta,
      model,
      session: "s",
      getText: async () => page,
      completeFn: async () => completion("I think they are fine."),
    });
    expect(out.verified.facts).toEqual({});
    expect(out.error).toMatch(/json/i);
  });

  it("makes no call when there is nothing to check", async () => {
    let calls = 0;
    const out = await checkVerified({
      verified: { programmePage: null, facts: {}, rejected: [] },
      meta,
      model,
      session: "s",
      getText: async () => page,
      completeFn: async () => {
        calls++;
        return completion("[]");
      },
    });
    expect(calls).toBe(0);
    expect(out.error).toBeNull();
  });
});

describe("checker instruction", () => {
  it("does not let an optional module in another language add a teaching language", () => {
    expect(CHECKER_INSTRUCTION).toMatch(/elective|optional/i);
  });
});
