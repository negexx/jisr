import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { worstFreshness } from "@/lib/journey/freshness";
import { PAGE_SECTIONS, pageFacts } from "@/lib/journey/page-facts";
import { loadProgramPageData, type ProgramPageData } from "@/lib/snapshot/server";

import { E2E_NOW, E2E_SLUGS } from "../../fixtures/e2e/profiles";
import { forbidConsole } from "../profile/no-console";
import { buildSnapshot, E2E_DATA_DIR, removeTempDirs } from "../snapshot/fixture";

forbidConsole();

let dir = "";

beforeAll(() => {
  dir = buildSnapshot(E2E_DATA_DIR);
}, 180_000);

afterAll(removeTempDirs);

async function pageData(slug: string): Promise<ProgramPageData> {
  const data = await loadProgramPageData(slug, "fr", dir);
  if (data === null) throw new Error(`no page data for ${slug}`);
  return data;
}

function metaOnly(meta: { source_url: string; info_kind: string; last_verified_at: string }) {
  return {
    source_url: meta.source_url,
    info_kind: meta.info_kind,
    last_verified_at: meta.last_verified_at,
  };
}

describe("pageFacts", () => {
  it("covers every section the ok program page shows", async () => {
    const facts = pageFacts(await pageData(E2E_SLUGS.ok), E2E_NOW);
    const sections = new Set(facts.map((f) => f.section));
    for (const section of [
      "overview",
      "requirements",
      "tuition",
      "costs",
      "deadline",
      "procedure",
      "documents",
      "scholarships",
    ] as const) {
      expect(sections, section).toContain(section);
    }
    for (const fact of facts) expect(PAGE_SECTIONS).toContain(fact.section);
  });

  it("lists tuition, intakes, languages, duration, documents and the channel link", async () => {
    const data = await pageData(E2E_SLUGS.ok);
    const facts = pageFacts(data, E2E_NOW);
    const at = (section: string, label: string) =>
      facts.find((f) => f.section === section && f.label === label);
    const { program } = data;
    const record = `programs/${program.slug}`;
    expect(at("tuition", `${record}#tuition`)?.meta).toMatchObject(metaOnly(program.tuition));
    expect(at("tuition", `${record}#tuition`)?.meta.source_url).toBe(
      "https://example.org/xx-test-fees",
    );
    expect(at("deadline", `${record}#intakes`)?.meta).toMatchObject(metaOnly(program.intakes));
    expect(at("overview", `${record}#teachingLanguages`)).toBeDefined();
    expect(at("overview", `${record}#durationYears`)).toBeDefined();
    expect(at("overview", "institutions/xx-test-inst-pub-b#")).toBeDefined();
    expect(at("documents", `${record}#documents`)).toBeDefined();
    expect(at("procedure", `${record}#applicationChannel`)).toBeDefined();
    expect(at("procedure", "application-channels/xx-test-channel-portal#")).toBeDefined();
  });

  it("lists the coverage fact and every requirement rule", async () => {
    const data = await pageData(E2E_SLUGS.ok);
    const requirements = pageFacts(data, E2E_NOW).filter((f) => f.section === "requirements");
    const record = `programs/${data.program.slug}`;
    expect(requirements.map((f) => f.label)).toEqual([
      `${record}#requirements`,
      ...data.program.requirements.rules.map((r) => `${record}#requirements.rules.${r.id}`),
    ]);
    for (const rule of data.program.requirements.rules) {
      const fact = requirements.find((f) => f.label.endsWith(`.${rule.id}`));
      expect(fact?.meta).toEqual(rule.fact);
    }
  });

  it("lists each cost line's fact, the tuition line included", async () => {
    const data = await pageData(E2E_SLUGS.ok);
    const costs = pageFacts(data, E2E_NOW).filter((f) => f.section === "costs");
    expect(costs.map((f) => f.label)).toEqual([
      `programs/${data.program.slug}#tuition`,
      ...["housing", "food", "transport", "insurance", "application_visa", "setup"].map(
        (c) => `cost-profiles/xx-test-costs-xb#lines.${c}`,
      ),
    ]);
    expect(costs.find((f) => f.label.endsWith("housing"))?.meta.info_kind).toBe("estimate");
    // Cost lines are FactRefs stamped with the real `now`, never a placeholder date.
    const later = pageFacts(data, "2030-01-01").filter((f) => f.section === "costs");
    for (const fact of later) expect(fact.meta).toHaveProperty("freshness", "stale");
    for (const fact of costs) expect(fact.meta).toHaveProperty("freshness", "fresh");
  });

  it("lists each scholarship's support and deadline", async () => {
    const data = await pageData(E2E_SLUGS.ok);
    const labels = pageFacts(data, E2E_NOW)
      .filter((f) => f.section === "scholarships")
      .map((f) => f.label);
    expect(data.scholarships.length).toBeGreaterThan(0);
    expect(labels).toEqual(
      data.scholarships.flatMap((s) => [
        `scholarships/${s.slug}#support`,
        `scholarships/${s.slug}#deadline`,
      ]),
    );
  });

  it("lists the guidance of the routes into the country under the scholarships section", async () => {
    const data = await pageData(E2E_SLUGS.ok);
    const note = {
      route: "xx-test-route-xa-xb",
      origin: "XA",
      id: "xx-test-aid",
      note: "admission-routes/xx-test-route-xa-xb#guidance.xx-test-aid.note",
      fact: {
        source_url: "https://example.org/aid",
        info_kind: "guidance" as const,
        last_verified_at: "2026-09-02",
        class: "stable" as const,
      },
    };
    const facts = pageFacts({ ...data, routeGuidance: [note] }, E2E_NOW).filter((f) =>
      f.label.includes("#guidance."),
    );
    expect(facts).toEqual([
      {
        section: "scholarships",
        label: "admission-routes/xx-test-route-xa-xb#guidance.xx-test-aid",
        meta: note.fact,
      },
    ]);
  });

  it("carries metadata only, never values, and excludes personal route facts", async () => {
    for (const slug of Object.values(E2E_SLUGS)) {
      const facts = pageFacts(await pageData(slug), E2E_NOW);
      for (const fact of facts) {
        expect(fact.meta).not.toHaveProperty("value");
        // Route guidance is the one route fact on the page: it does not depend on the student.
        expect(
          fact.label.startsWith("admission-routes/") && !fact.label.includes("#guidance."),
        ).toBe(false);
      }
      const pairs = facts.map((f) => `${f.section} ${f.label}`);
      expect(new Set(pairs).size).toBe(pairs.length);
      expect(JSON.parse(JSON.stringify(facts))).toStrictEqual(facts);
    }
  });

  it("gives the page freshness: stale program stale, ok program fresh", async () => {
    const stale = pageFacts(await pageData(E2E_SLUGS.stale), E2E_NOW).map((f) => f.meta);
    const ok = pageFacts(await pageData(E2E_SLUGS.ok), E2E_NOW).map((f) => f.meta);
    expect(worstFreshness(stale, E2E_NOW)).toBe("stale");
    expect(worstFreshness(ok, E2E_NOW)).toBe("fresh");
  });

  it("skips what the page data does not have", async () => {
    const data = await pageData(E2E_SLUGS.ok);
    const bare: ProgramPageData = {
      ...data,
      institution: null,
      applicationChannel: null,
      costProfiles: [],
      scholarships: [],
      routeGuidance: [],
    };
    const facts = pageFacts(bare, E2E_NOW);
    expect(facts.some((f) => f.label.startsWith("institutions/"))).toBe(false);
    expect(facts.some((f) => f.label.startsWith("application-channels/"))).toBe(false);
    expect(facts.filter((f) => f.section === "costs").map((f) => f.label)).toEqual([
      `programs/${data.program.slug}#tuition`,
    ]);
    expect(facts.some((f) => f.section === "scholarships")).toBe(false);
  });
});
