export const USAGE = [
  "Usage: pnpm ops:smoke <base-url> --expect=indexable|noindex [--min-urls=N]",
  "  --expect=indexable|noindex  required: whether the site under test is the public production site",
  "  --min-urls=N                optional, with --expect=indexable only: fail if the sitemap lists fewer than N URLs",
].join("\n");

export type SmokeArgs = {
  baseUrl: string;
  expectIndexable: boolean;
  minUrls: number | undefined;
};

function parseBaseUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function parseSmokeArgs(argv: readonly string[]): SmokeArgs | null {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const flags = argv.filter((arg) => arg.startsWith("--"));
  const [rawUrl] = positional;
  if (positional.length !== 1 || rawUrl === undefined) return null;
  const baseUrl = parseBaseUrl(rawUrl);
  if (baseUrl === null) return null;

  const expectFlags = flags.filter((flag) => flag.startsWith("--expect="));
  const minUrlFlags = flags.filter((flag) => flag.startsWith("--min-urls="));
  if (expectFlags.length !== 1 || minUrlFlags.length > 1) return null;
  if (flags.length !== expectFlags.length + minUrlFlags.length) return null;

  const expect = expectFlags[0];
  if (expect !== "--expect=indexable" && expect !== "--expect=noindex") return null;
  const expectIndexable = expect === "--expect=indexable";

  let minUrls: number | undefined;
  const minUrlFlag = minUrlFlags[0];
  if (minUrlFlag !== undefined) {
    const digits = minUrlFlag.slice("--min-urls=".length);
    if (!expectIndexable || !/^[1-9]\d*$/.test(digits)) return null;
    minUrls = Number(digits);
  }
  return { baseUrl, expectIndexable, minUrls };
}
