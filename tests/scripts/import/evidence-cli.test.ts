import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";

import {
  inSelection,
  readSlugFilter,
  restage,
  verifyAll,
} from "../../../scripts/import/evidence-cli";

describe("inSelection", () => {
  it("selects everything when there is no filter", () => {
    expect(inSelection("any-slug", null)).toBe(true);
  });

  it("selects only the slugs in the filter", () => {
    const only = new Set(["a", "b"]);
    expect(inSelection("a", only)).toBe(true);
    expect(inSelection("c", only)).toBe(false);
  });
});

describe("readSlugFilter", () => {
  it("is null without --slugs", async () => {
    expect(await readSlugFilter(["--dry-run"])).toBeNull();
  });

  it("reads one slug per line, ignoring blank lines and spaces", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "slugs-"));
    const file = path.join(dir, "slugs.txt");
    await writeFile(file, "a\n\n  b  \r\nc\n");
    expect([...((await readSlugFilter(["--slugs", file])) ?? [])]).toEqual(["a", "b", "c"]);
  });

  it("refuses an empty filter, so a typo never means 'everything'", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "slugs-"));
    const file = path.join(dir, "empty.txt");
    await writeFile(file, "\n\n");
    await expect(readSlugFilter(["--slugs", file])).rejects.toThrow(/empty/i);
  });
});

type Rec = Record<string, unknown>;
const at = (record: Rec, key: string): Rec => record[key] as Rec;

const TUITION_QUOTE = "Tuition for non-EU students: EUR 1,500 per semester";
const FEES_URL = "https://hs.example/fees";
const PROGRAMME_URL = "https://hs.example/cs";

const promotedRecord = (): Rec => ({
  slug: "de-xx",
  name: "Computer Science",
  officialUrl: PROGRAMME_URL,
  summary: { fr: { text: "s", status: "draft" } },
  durationYears: { value: 3, source: "programme", info_kind: "official" },
  teachingLanguages: { value: ["en"], source: "programme", info_kind: "official" },
  tuition: { value: null, source: "programme", info_kind: "official" },
  intakes: { value: null, source: "programme", info_kind: "official" },
  applicationChannel: { value: null, source: "programme", info_kind: "official" },
  documents: { value: null, source: "programme", info_kind: "official" },
  requirements: { coverage: "partial", source: "programme", info_kind: "official", rules: [] },
  scholarships: [],
  sources: { programme: { url: PROGRAMME_URL, last_verified_at: "2026-09-01" } },
});

const tuitionProposal = (programmePage: string | null) => ({
  slug: "de-xx",
  programmePage,
  facts: {
    tuition: {
      value: { amountMinor: 150000, currency: "EUR", period: "semester" },
      evidence: [{ url: FEES_URL, quote: TUITION_QUOTE }],
    },
  },
});

async function workspace(proposal: unknown, proposalsInStaging: boolean) {
  const root = await mkdtemp(path.join(tmpdir(), "enrich-cli-"));
  const stagingDir = path.join(root, "staging");
  const dataDir = path.join(root, "data");
  const enrichDir = path.join(root, "enrich");
  const proposalDir = proposalsInStaging
    ? path.join(stagingDir, "proposals", "programs")
    : enrichDir;
  await mkdir(path.join(dataDir, "programs"), { recursive: true });
  await mkdir(proposalDir, { recursive: true });
  await writeFile(path.join(dataDir, "programs", "de-xx.yaml"), stringify(promotedRecord()));
  await writeFile(path.join(proposalDir, "de-xx.json"), JSON.stringify(proposal));
  const staged = path.join(stagingDir, "programs", "de-xx.yaml");
  const readStaged = async (): Promise<Rec> => parse(await readFile(staged, "utf8")) as Rec;
  return { stagingDir, dataDir, enrichDir, staged, readStaged };
}

const LANG_URL = "https://hs.example/lang";
const pages: Record<string, string> = {
  [FEES_URL]: `${TUITION_QUOTE}.`,
  [LANG_URL]: "The programme is taught in German.",
  [PROGRAMME_URL]: "Computer Science at Example University",
};
const getText = async (url: string): Promise<string> => {
  const text = pages[url];
  if (text === undefined) throw new Error("not found");
  return text;
};

const germanFact = {
  value: ["de"],
  evidence: [{ url: LANG_URL, quote: "The programme is taught in German" }],
};

type Workspace = Awaited<ReturnType<typeof workspace>>;

async function enrichRun(w: Workspace): Promise<string[]> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  try {
    await verifyAll(false, null, { enrichDir: w.enrichDir, stagingDir: w.stagingDir, getText });
  } finally {
    log.mockRestore();
  }
  return lines;
}

const restageForEnrichment = (w: Workspace) =>
  restage(null, { enrichDir: w.enrichDir, stagingDir: w.stagingDir, dataDir: w.dataDir });

describe("restage", () => {
  it("with enrichDir brings back a record that has a proposal with facts, keeping its dates", async () => {
    const w = await workspace(tuitionProposal(null), false);
    const restaged = await restage(null, {
      enrichDir: w.enrichDir,
      stagingDir: w.stagingDir,
      dataDir: w.dataDir,
    });
    expect(restaged).toEqual(["programs/de-xx"]);
    const record = await w.readStaged();
    expect(at(at(record, "sources"), "programme").last_verified_at).toBe("2026-09-01");
    expect(at(record, "_review").revises).toBe(true);
  });

  it("with enrichDir skips a proposal that has no facts", async () => {
    const w = await workspace({ slug: "de-xx", programmePage: null, facts: {} }, false);
    const restaged = await restage(null, {
      enrichDir: w.enrichDir,
      stagingDir: w.stagingDir,
      dataDir: w.dataDir,
    });
    expect(restaged).toEqual([]);
    await expect(readFile(w.staged, "utf8")).rejects.toThrow();
  });

  it("without enrichDir reads the staging proposals and clears the dates", async () => {
    const w = await workspace(tuitionProposal(PROGRAMME_URL), true);
    const restaged = await restage(null, { stagingDir: w.stagingDir, dataDir: w.dataDir });
    expect(restaged).toEqual(["programs/de-xx"]);
    const record = await w.readStaged();
    expect(at(at(record, "sources"), "programme").last_verified_at).toBeNull();
    expect(at(record, "_review").revises).toBe(true);
  });
});

describe("verifyAll", () => {
  it("with enrichDir writes the enriched record and leaves the restaged requirements", async () => {
    const w = await workspace(tuitionProposal(null), false);
    const options = { enrichDir: w.enrichDir, stagingDir: w.stagingDir, dataDir: w.dataDir };
    await restage(null, options);
    const before = await w.readStaged();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await verifyAll(false, null, { enrichDir: w.enrichDir, stagingDir: w.stagingDir, getText });
    } finally {
      log.mockRestore();
    }
    const after = await w.readStaged();
    expect(at(after, "tuition")).toMatchObject({ source: "page-1", info_kind: "official" });
    expect(at(at(after, "sources"), "page-1").url).toBe(FEES_URL);
    expect(after.requirements).toEqual(before.requirements);
    expect(after.officialUrl).toBe(PROGRAMME_URL);
    expect(at(after, "durationYears")).toEqual(at(before, "durationYears"));
  });

  it("without enrichDir keeps resetting what the reader did not establish", async () => {
    const w = await workspace(tuitionProposal(PROGRAMME_URL), true);
    await restage(null, { stagingDir: w.stagingDir, dataDir: w.dataDir });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await verifyAll(false, null, { stagingDir: w.stagingDir, getText });
    } finally {
      log.mockRestore();
    }
    const after = await w.readStaged();
    expect(at(after, "tuition").source).toBe("page-2");
    expect(at(after, "durationYears")).toEqual({
      value: null,
      source: "programme",
      info_kind: "official",
    });
    expect(at(after, "_review").preparedBy).toBe("assistant");
  });

  it("without enrichDir leaves a record whose programme page is not verified alone", async () => {
    const w = await workspace(tuitionProposal("https://hs.example/missing"), true);
    await restage(null, { stagingDir: w.stagingDir, dataDir: w.dataDir });
    const before = await readFile(w.staged, "utf8");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await verifyAll(false, null, { stagingDir: w.stagingDir, getText });
    } finally {
      log.mockRestore();
    }
    expect(await readFile(w.staged, "utf8")).toBe(before);
  });
});

describe("restage --enrich bookkeeping", () => {
  it("marks the record, carries the ledger source id and drops only its audit rows", async () => {
    const w = await workspace(tuitionProposal(null), false);
    await mkdir(w.stagingDir, { recursive: true });
    await writeFile(
      path.join(w.stagingDir, "PROMOTED.csv"),
      "collection,sourceId,slug,date,level,batch\nprograms,src-1,de-xx,2026-09-01,human,b1\n",
    );
    await writeFile(
      path.join(w.stagingDir, "AUDIT.csv"),
      "key,batch,inSample,audited,outcome,notes\nprograms/de-xx,b1,y,y,ok,\nprograms/other,b1,,,,\n",
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await restageForEnrichment(w);
    } finally {
      log.mockRestore();
    }
    const review = at(await w.readStaged(), "_review");
    expect(review.enrich).toBe(true);
    expect(review.sourceId).toBe("src-1");
    const audit = await readFile(path.join(w.stagingDir, "AUDIT.csv"), "utf8");
    expect(audit).toContain("programs/other");
    expect(audit).not.toContain("programs/de-xx");
  });
});

describe("verifyAll in enrich mode", () => {
  it("leaves a staged record that restage --enrich did not mark, and says so", async () => {
    const w = await workspace(tuitionProposal(null), false);
    await mkdir(path.dirname(w.staged), { recursive: true });
    await writeFile(w.staged, stringify({ ...promotedRecord(), _review: { revises: true } }));
    const before = await readFile(w.staged, "utf8");
    const lines = await enrichRun(w);
    expect(await readFile(w.staged, "utf8")).toBe(before);
    expect(lines).toContain("skipped (not restaged for enrichment): de-xx");
  });

  it("lists only the fields that changed and flags an unverified programme page", async () => {
    const w = await workspace(
      {
        ...tuitionProposal(null),
        facts: { ...tuitionProposal(null).facts, teachingLanguages: germanFact },
      },
      false,
    );
    await restageForEnrichment(w);
    const line = (await enrichRun(w)).find((l) => l.startsWith("programs/de-xx:")) ?? "";
    expect(line).toMatch(/enriched tuition(;|$)/);
    expect(line).not.toMatch(/enriched[^;]*teachingLanguages/);
    expect(line).toContain("page NOT verified");
    expect(line).toContain("kept existing official value");
  });

  it("writes a conflicts-only note and tells the runbook to discard the revision", async () => {
    const w = await workspace(
      { ...tuitionProposal(null), facts: { teachingLanguages: germanFact } },
      false,
    );
    await restageForEnrichment(w);
    const lines = await enrichRun(w);
    expect(lines).toContain("no new facts: discard the staged revision for de-xx");
    const after = await w.readStaged();
    expect(String(at(after, "_review").notes)).toContain(
      "teachingLanguages: kept the existing official value",
    );
    expect(at(after, "teachingLanguages").value).toEqual(["en"]);
  });

  it("tells the runbook to discard a revision when nothing was proved", async () => {
    const w = await workspace(
      {
        ...tuitionProposal(null),
        facts: {
          tuition: {
            value: { amountMinor: 150000, currency: "EUR", period: "semester" },
            evidence: [{ url: "https://hs.example/missing", quote: "not on any page" }],
          },
        },
      },
      false,
    );
    await restageForEnrichment(w);
    const lines = await enrichRun(w);
    expect(lines).toContain("no new facts: discard the staged revision for de-xx");
  });

  it("on a second run does not tell the runbook to discard what the first run filled", async () => {
    const w = await workspace(tuitionProposal(null), false);
    await restageForEnrichment(w);
    await enrichRun(w);
    const lines = await enrichRun(w);
    expect(lines).toContain("no further facts for de-xx (earlier enrichment kept)");
    expect(lines.some((l) => l.startsWith("no new facts: discard"))).toBe(false);
    expect(at(await w.readStaged(), "tuition")).toMatchObject({ source: "page-1" });
  });

  it("flags a kept official value only for a conflict found in this run", async () => {
    const w = await workspace(
      {
        ...tuitionProposal(null),
        facts: { ...tuitionProposal(null).facts, teachingLanguages: germanFact },
      },
      false,
    );
    await restageForEnrichment(w);
    await enrichRun(w);
    await writeFile(path.join(w.enrichDir, "de-xx.json"), JSON.stringify(tuitionProposal(null)));
    const line = (await enrichRun(w)).find((l) => l.startsWith("programs/de-xx:")) ?? "";
    expect(line).not.toContain("kept existing official value");
  });

  it("reports that requirements are ignored", async () => {
    const w = await workspace(
      {
        ...tuitionProposal(null),
        requirements: {
          rules: [
            {
              kind: "manual_check",
              note: "check the fees page",
              evidence: [{ url: FEES_URL, quote: TUITION_QUOTE }],
            },
          ],
        },
      },
      false,
    );
    await restageForEnrichment(w);
    const lines = await enrichRun(w);
    expect(lines.some((l) => l.includes("requirements ignored in enrich mode"))).toBe(true);
    expect(at(await w.readStaged(), "requirements").rules).toEqual([]);
  });
});
