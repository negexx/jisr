import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { GUIDE_SLUGS } from "@/lib/guides/catalog";
import { parseGuideFrontmatter } from "@/lib/guides/frontmatter";

import { FORBIDDEN } from "../i18n/forbidden-wording";

// Vitest has no MDX transform: stub the three body modules so importing the catalog exposes
// GUIDE_SLUGS. The real frontmatter of each file is parsed and validated below from disk.
vi.mock("@content/fr/guides/studying-in-europe.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/en/guides/studying-in-europe.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/ar/guides/studying-in-europe.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/fr/guides/bac-and-european-universities.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/en/guides/bac-and-european-universities.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/ar/guides/bac-and-european-universities.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/fr/guides/documents-and-legalisation.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/en/guides/documents-and-legalisation.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/ar/guides/documents-and-legalisation.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/fr/guides/scholarships-for-moroccan-students.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/en/guides/scholarships-for-moroccan-students.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/ar/guides/scholarships-for-moroccan-students.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/fr/guides/common-mistakes.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/en/guides/common-mistakes.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));
vi.mock("@content/ar/guides/common-mistakes.mdx", () => ({
  default: () => null,
  frontmatter: {
    source_url: "https://example.org/guide",
    info_kind: "guidance",
    last_verified_at: "2026-10-11",
  },
}));

const LOCALES = ["en", "fr", "ar"] as const;

type Locale = (typeof LOCALES)[number];

function read(locale: Locale, slug: string): string {
  return readFileSync(
    path.resolve(process.cwd(), "content", locale, "guides", `${slug}.mdx`),
    "utf8",
  );
}

function lines(source: string, pattern: RegExp): number {
  return source.split("\n").filter((line) => pattern.test(line)).length;
}

// The frontmatter is an ESM object literal, so the schema is fed the exact values written in the
// file rather than a second copy that could drift.
function frontmatterOf(source: string) {
  const block = source.match(/export const frontmatter = \{([\s\S]*?)\};/);
  if (block === null) throw new Error("missing frontmatter block");
  const field = (name: string): string => {
    const match = block[1]?.match(new RegExp(`${name}:\\s*"([^"]*)"`)) ?? null;
    if (match === null) throw new Error(`missing ${name}`);
    return match[1] ?? "";
  };
  return parseGuideFrontmatter({
    source_url: field("source_url"),
    info_kind: field("info_kind"),
    last_verified_at: field("last_verified_at"),
  });
}

// URLs and the frontmatter object carry ASCII punctuation (":" in "https://", in "source_url:") that
// the French spacing rule does not apply to; strip them before checking the prose.
function prose(source: string): string {
  return source
    .replace(/export const frontmatter = \{[\s\S]*?\};/, "")
    .replace(/https?:\/\/\S+/g, "");
}

describe.each(GUIDE_SLUGS)("guide %s", (slug) => {
  it.each(LOCALES)("content/%s/%s.mdx is a complete guide", (locale) => {
    const source = read(locale, slug);
    expect(source.trim().length, `${locale} length`).toBeGreaterThan(400);
    expect(lines(source, /^# /), `${locale} H1 count`).toBe(1);
    expect(lines(source, /^## /), `${locale} H2 count`).toBeGreaterThanOrEqual(5);
  });

  it.each(LOCALES)("content/%s/%s.mdx has valid provenance frontmatter", (locale) => {
    expect(() => frontmatterOf(read(locale, slug))).not.toThrow();
  });

  it.each(LOCALES)("content/%s/%s.mdx uses no forbidden wording", (locale) => {
    const source = read(locale, slug);
    for (const pattern of FORBIDDEN[locale]) {
      expect(source, `${locale} ${pattern}`).not.toMatch(pattern);
    }
  });

  it.each(LOCALES)("content/%s/%s.mdx has no em or en dash", (locale) => {
    expect(read(locale, slug)).not.toMatch(/[\u2013\u2014]/);
  });
});

describe("guide translations", () => {
  it.each(GUIDE_SLUGS)("Arabic content/%s is not a copy of French", (slug) => {
    expect(read("ar", slug)).not.toBe(read("fr", slug));
  });

  it.each(GUIDE_SLUGS)("French content/%s puts a no-break space before : ? ! ;", (slug) => {
    expect(prose(read("fr", slug))).not.toMatch(/[^\u00a0][:?!;]/u);
  });
});
