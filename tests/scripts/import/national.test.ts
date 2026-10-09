import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { staleProposalFiles } from "../../../scripts/import/fr-calendar";
import {
  buildNationalProposals,
  type Entry,
  type NationalProgramme,
  parseRegistry,
  readNationalProgrammes,
  type Selector,
  selects,
  writeNationalProposals,
} from "../../../scripts/import/national";
import { ProposalSchema } from "../../../scripts/import/proposals";

const PAGE_URL = "https://www.studyinnl.org/plan-your-stay/how-to-apply";
const CHANNEL_QUOTE = "International students apply for a bachelor through Studielink.";
const DOCS_URL = "https://www.uni-assist.de/en/how-to-apply/";
const DOCS_QUOTE = "Please send a certified copy of your school-leaving certificate and passport.";

const pages: Record<string, string> = {
  [PAGE_URL]: `Intro text. ${CHANNEL_QUOTE} More text.`,
  [DOCS_URL]: `Before you apply. ${DOCS_QUOTE} After that, wait.`,
};
const getText = async (url: string): Promise<string> => {
  const text = pages[url];
  if (text === undefined) throw new Error(`no page ${url}`);
  return text;
};

const channelEntry = (over: Record<string, unknown> = {}) => ({
  id: "nl-channel",
  fact: "applicationChannel",
  infoKind: "official",
  channel: "nl-studielink",
  selector: { country: "NL" },
  evidence: [{ url: PAGE_URL, quote: CHANNEL_QUOTE }],
  ...over,
});

const documentsEntry = (over: Record<string, unknown> = {}) => ({
  id: "de-documents",
  fact: "documents",
  infoKind: "guidance",
  selector: { country: "NL" },
  items: [
    {
      slug: "passport",
      name: { fr: "Passeport", en: "Passport" },
      quotedAs: "passport",
      translationRequired: null,
    },
  ],
  evidence: [{ url: DOCS_URL, quote: DOCS_QUOTE }],
  ...over,
});

const parseEntry = (raw: unknown): Entry => {
  const entry = parseRegistry({ entries: [raw] }).entries[0];
  if (entry === undefined) throw new Error("no entry");
  return entry;
};

const programme = (over: Partial<NationalProgramme> = {}): NationalProgramme => ({
  slug: "nl-a",
  name: "Programme A",
  country: "NL",
  institution: "nl-inst",
  institutionType: "public",
  kind: null,
  channel: null,
  holdsDocuments: false,
  ...over,
});

describe("parseRegistry", () => {
  it("accepts a minimal documents entry and a minimal channel entry", () => {
    const parsed = parseRegistry({ entries: [channelEntry(), documentsEntry()] });
    expect(parsed.entries).toHaveLength(2);
  });

  it("rejects a non-https evidence url", () => {
    const bad = channelEntry({ evidence: [{ url: "http://x.example/a", quote: CHANNEL_QUOTE }] });
    expect(() => parseRegistry({ entries: [bad] })).toThrow();
  });

  it("rejects a quote shorter than 15 characters", () => {
    const bad = channelEntry({ evidence: [{ url: PAGE_URL, quote: "Studielink." }] });
    expect(() => parseRegistry({ entries: [bad] })).toThrow();
  });

  it("rejects a document item with translationRequired false", () => {
    const [item] = documentsEntry().items;
    const bad = documentsEntry({ items: [{ ...item, translationRequired: false }] });
    expect(() => parseRegistry({ entries: [bad] })).toThrow();
  });

  it("accepts translationRequired true", () => {
    const [item] = documentsEntry().items;
    const ok = documentsEntry({ items: [{ ...item, translationRequired: true }] });
    expect(parseRegistry({ entries: [ok] }).entries).toHaveLength(1);
  });

  it("rejects a documents entry without items", () => {
    expect(() => parseRegistry({ entries: [documentsEntry({ items: [] })] })).toThrow();
    const { items: _items, ...noItems } = documentsEntry();
    expect(() => parseRegistry({ entries: [noItems] })).toThrow();
  });

  it("rejects a channel entry without a channel", () => {
    const { channel: _channel, ...noChannel } = channelEntry();
    expect(() => parseRegistry({ entries: [noChannel] })).toThrow();
  });
});

describe("selects", () => {
  const sel = (s: Omit<Selector, "country"> & { country?: Selector["country"] }): Selector => ({
    country: "NL",
    ...s,
  });

  it("requires the same country", () => {
    expect(selects(programme(), sel({}))).toBe(true);
    expect(selects(programme(), sel({ country: "DE" }))).toBe(false);
  });

  it("filters by institution list", () => {
    expect(selects(programme(), sel({ institutions: ["nl-inst", "other"] }))).toBe(true);
    expect(selects(programme(), sel({ institutions: ["other"] }))).toBe(false);
  });

  it("filters by institution type and never matches an unknown type", () => {
    expect(
      selects(programme({ institutionType: "public" }), sel({ institutionType: "public" })),
    ).toBe(true);
    expect(
      selects(programme({ institutionType: "private" }), sel({ institutionType: "public" })),
    ).toBe(false);
    expect(
      selects(programme({ institutionType: "private" }), sel({ institutionType: "private" })),
    ).toBe(true);
    expect(selects(programme({ institutionType: null }), sel({ institutionType: "public" }))).toBe(
      false,
    );
    expect(selects(programme({ institutionType: null }), sel({ institutionType: "private" }))).toBe(
      false,
    );
  });

  it("filters by programme kind", () => {
    const fr = programme({ country: "FR", kind: "but" });
    expect(selects(fr, sel({ country: "FR", kinds: ["but", "licence"] }))).toBe(true);
    expect(selects(fr, sel({ country: "FR", kinds: ["licence"] }))).toBe(false);
    expect(selects(programme({ kind: null }), sel({ kinds: ["but"] }))).toBe(false);
  });

  it("filters by the programme's current channel", () => {
    const held = programme({ channel: "nl-studielink" });
    expect(selects(held, sel({ channels: ["nl-studielink"] }))).toBe(true);
    expect(selects(held, sel({ channels: ["other"] }))).toBe(false);
    expect(selects(programme({ channel: null }), sel({ channels: ["nl-studielink"] }))).toBe(false);
  });
});

describe("readNationalProgrammes", () => {
  let root = "";
  afterEach(async () => {
    if (root !== "") await rm(root, { recursive: true, force: true });
  });

  it("reads country, institution type, channel, documents held and the French kind", async () => {
    root = await mkdtemp(path.join(tmpdir(), "national-"));
    await mkdir(path.join(root, "institutions"), { recursive: true });
    await mkdir(path.join(root, "programs"), { recursive: true });
    const inst = (slug: string, type: string) =>
      writeFile(
        path.join(root, "institutions", `${slug}.yaml`),
        `slug: ${slug}\nname: X\ntype: ${type}\n`,
      );
    await inst("fr-public", "public");
    await inst("fr-private", "private");
    await inst("nl-unknown", "null");
    const prog = (slug: string, institution: string, name: string, extra: string) =>
      writeFile(
        path.join(root, "programs", `${slug}.yaml`),
        `slug: ${slug}\ninstitution: ${institution}\ncountry: ${slug.slice(0, 2).toUpperCase()}\nname: ${name}\n${extra}`,
      );
    await prog("fr-a-but-info", "fr-public", "BUT Informatique", "");
    await prog(
      "fr-b-licence",
      "fr-private",
      "Licence Economie",
      "applicationChannel:\n  value: fr-parcoursup\n  source: programme\n  info_kind: official\ndocuments:\n  value:\n    - slug: passport\n      translationRequired: null\n  source: programme\n  info_kind: official\n",
    );
    await prog(
      "nl-c",
      "nl-unknown",
      "Programme C",
      "applicationChannel:\n  value: null\n  source: programme\n  info_kind: official\ndocuments:\n  value: []\n  source: programme\n  info_kind: official\n",
    );
    const found = await readNationalProgrammes(root);
    const bySlug = new Map(found.map((p) => [p.slug, p]));
    expect(bySlug.get("fr-a-but-info")).toEqual({
      slug: "fr-a-but-info",
      name: "BUT Informatique",
      country: "FR",
      institution: "fr-public",
      institutionType: "public",
      kind: "but",
      channel: null,
      holdsDocuments: false,
    });
    expect(bySlug.get("fr-b-licence")).toMatchObject({
      institutionType: "private",
      kind: "licence",
      channel: "fr-parcoursup",
      holdsDocuments: true,
    });
    expect(bySlug.get("nl-c")).toMatchObject({
      institutionType: null,
      kind: null,
      channel: null,
      holdsDocuments: false,
    });
  });
});

describe("buildNationalProposals", () => {
  it("proposes a channel for every selected programme that holds none", async () => {
    const programmes = [programme({ slug: "nl-a" }), programme({ slug: "nl-b" })];
    const { proposals, reports } = await buildNationalProposals({
      entries: [parseEntry(channelEntry())],
      programmes,
      getText,
    });
    expect(proposals.map((p) => p.slug)).toEqual(["nl-a", "nl-b"]);
    const [first] = proposals;
    expect(first?.programmePage).toBeNull();
    expect(first?.facts.applicationChannel).toEqual({
      value: "nl-studielink",
      evidence: [{ url: PAGE_URL, quote: CHANNEL_QUOTE }],
    });
    for (const proposal of proposals) expect(() => ProposalSchema.parse(proposal)).not.toThrow();
    expect(reports).toEqual([
      { id: "nl-channel", selected: 2, proposed: 2, skipped: [], rejected: [] },
    ]);
  });

  it("proposes nothing and reports a reason when the quote is not on the page", async () => {
    const entry = parseEntry(
      channelEntry({
        evidence: [{ url: PAGE_URL, quote: "This sentence is not on the page at all." }],
      }),
    );
    const { proposals, reports } = await buildNationalProposals({
      entries: [entry],
      programmes: [programme()],
      getText,
    });
    expect(proposals).toEqual([]);
    expect(reports[0]?.proposed).toBe(0);
    expect(reports[0]?.rejected).toEqual(["no quote was found verbatim on the cited page(s)"]);
  });

  it("proposes nothing when the page cannot be fetched", async () => {
    const entry = parseEntry(
      channelEntry({ evidence: [{ url: "https://gone.example/x", quote: CHANNEL_QUOTE }] }),
    );
    const { proposals, reports } = await buildNationalProposals({
      entries: [entry],
      programmes: [programme()],
      getText,
    });
    expect(proposals).toEqual([]);
    expect(reports[0]?.rejected).toHaveLength(1);
  });

  it("skips and counts programmes that already hold the fact", async () => {
    const programmes = [
      programme({ slug: "nl-a", channel: "nl-studielink" }),
      programme({ slug: "nl-b", channel: null }),
      programme({ slug: "nl-c", holdsDocuments: true }),
    ];
    const channel = await buildNationalProposals({
      entries: [parseEntry(channelEntry())],
      programmes,
      getText,
    });
    expect(channel.proposals.map((p) => p.slug)).toEqual(["nl-b", "nl-c"]);
    expect(channel.reports[0]).toMatchObject({ selected: 3, proposed: 2 });
    expect(channel.reports[0]?.skipped).toHaveLength(1);

    const documents = await buildNationalProposals({
      entries: [parseEntry(documentsEntry())],
      programmes,
      getText,
    });
    expect(documents.proposals.map((p) => p.slug)).toEqual(["nl-a", "nl-b"]);
    expect(documents.reports[0]?.skipped).toHaveLength(1);
  });

  it("carries guidance into the documents fact and nothing for official", async () => {
    const guidance = await buildNationalProposals({
      entries: [parseEntry(documentsEntry())],
      programmes: [programme()],
      getText,
    });
    expect(guidance.proposals[0]?.facts.documents?.infoKind).toBe("guidance");
    expect(guidance.proposals[0]?.facts.documents?.value).toEqual([
      {
        slug: "passport",
        name: { fr: "Passeport", en: "Passport" },
        quotedAs: "passport",
        translationRequired: null,
      },
    ]);
    const official = await buildNationalProposals({
      entries: [parseEntry(documentsEntry({ infoKind: "official" }))],
      programmes: [programme()],
      getText,
    });
    expect(official.proposals[0]?.facts.documents).not.toHaveProperty("infoKind");
  });

  it("merges two entries for the same programme into one proposal", async () => {
    const { proposals, reports } = await buildNationalProposals({
      entries: [parseEntry(documentsEntry()), parseEntry(channelEntry())],
      programmes: [programme()],
      getText,
    });
    expect(proposals).toHaveLength(1);
    expect(Object.keys(proposals[0]?.facts ?? {}).sort()).toEqual([
      "applicationChannel",
      "documents",
    ]);
    expect(reports.map((r) => r.proposed)).toEqual([1, 1]);
  });

  it("carries the entry notes into the proposal notes for the auditor", async () => {
    const { proposals } = await buildNationalProposals({
      entries: [
        parseEntry(documentsEntry({ notes: "General guidance." })),
        parseEntry(channelEntry({ notes: "Channel note." })),
      ],
      programmes: [programme()],
      getText,
    });
    expect(proposals[0]?.notes).toBe("General guidance.\nChannel note.");
  });

  it("keeps the first claim when two entries claim the same fact", async () => {
    const first = channelEntry({ id: "first" });
    const second = channelEntry({ id: "second", channel: "nl-studielink" });
    const { proposals, reports } = await buildNationalProposals({
      entries: [parseEntry(first), parseEntry(second)],
      programmes: [programme()],
      getText,
    });
    expect(proposals).toHaveLength(1);
    expect(reports[0]).toMatchObject({ id: "first", proposed: 1, skipped: [] });
    expect(reports[1]).toMatchObject({ id: "second", selected: 1, proposed: 0 });
    expect(reports[1]?.skipped).toHaveLength(1);
  });

  it("keeps a document item the quote does not name, but rejects the entry when no item is named", async () => {
    const [item] = documentsEntry().items;
    const mixed = parseEntry(
      documentsEntry({
        items: [
          item,
          {
            slug: "photo",
            name: { fr: "Photo" },
            quotedAs: "photograph",
            translationRequired: null,
          },
        ],
      }),
    );
    const kept = await buildNationalProposals({
      entries: [mixed],
      programmes: [programme()],
      getText,
    });
    expect(kept.proposals[0]?.facts.documents?.value).toHaveLength(2);

    const none = parseEntry(
      documentsEntry({
        items: [
          {
            slug: "photo",
            name: { fr: "Photo" },
            quotedAs: "photograph",
            translationRequired: null,
          },
        ],
      }),
    );
    const rejected = await buildNationalProposals({
      entries: [none],
      programmes: [programme()],
      getText,
    });
    expect(rejected.proposals).toEqual([]);
    expect(rejected.reports[0]?.rejected).toEqual(["no document is named in an accepted quote"]);
  });

  it("verifies an entry once whatever the number of programmes", async () => {
    const calls: string[] = [];
    const counting = async (url: string) => {
      calls.push(url);
      return getText(url);
    };
    const programmes = Array.from({ length: 5 }, (_, i) => programme({ slug: `nl-${i}` }));
    await buildNationalProposals({
      entries: [parseEntry(channelEntry())],
      programmes,
      getText: counting,
    });
    expect(calls).toEqual([PAGE_URL]);
  });

  it("selects nothing for a selector no programme matches", async () => {
    const { proposals, reports } = await buildNationalProposals({
      entries: [parseEntry(channelEntry({ selector: { country: "DE" } }))],
      programmes: [programme()],
      getText,
    });
    expect(proposals).toEqual([]);
    expect(reports[0]).toMatchObject({ selected: 0, proposed: 0, rejected: [] });
  });
});

describe("writeNationalProposals", () => {
  let root = "";
  afterEach(async () => {
    if (root !== "") await rm(root, { recursive: true, force: true });
  });

  const twoProposals = async () =>
    (
      await buildNationalProposals({
        entries: [parseEntry(channelEntry())],
        programmes: [programme({ slug: "nl-b" }), programme({ slug: "nl-a" })],
        getText,
      })
    ).proposals;

  it("writes nothing on a dry run", async () => {
    root = await mkdtemp(path.join(tmpdir(), "national-out-"));
    const dir = path.join(root, "out");
    await writeNationalProposals(await twoProposals(), dir, true);
    await expect(readdir(dir)).rejects.toThrow();
  });

  it("writes one json per slug and a sorted slugs.txt", async () => {
    root = await mkdtemp(path.join(tmpdir(), "national-out-"));
    const dir = path.join(root, "out");
    const proposals = await twoProposals();
    await writeNationalProposals(proposals, dir, false);
    expect((await readdir(dir)).sort()).toEqual(["nl-a.json", "nl-b.json", "slugs.txt"]);
    expect(await readFile(path.join(dir, "slugs.txt"), "utf8")).toBe("nl-a\nnl-b\n");
    const text = await readFile(path.join(dir, "nl-a.json"), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toMatchObject({ slug: "nl-a", programmePage: null });
  });

  it("leaves leftovers from an earlier run in place and reports them as stale", async () => {
    root = await mkdtemp(path.join(tmpdir(), "national-out-"));
    const dir = path.join(root, "out");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "nl-old.json"), "{}\n");
    const proposals = await twoProposals();
    await writeNationalProposals(proposals, dir, false);
    expect(await readdir(dir)).toContain("nl-old.json");
    expect(await staleProposalFiles(dir, proposals)).toEqual(["nl-old.json"]);
  });
});
