// Display-only decoding of punycode hostnames (RFC 3492), for source badges: a student should read
// "www.bafög.de", not "www.xn--bafg-7qa.de". Decoding only, no encoder; a label that does not
// decode cleanly is shown as written.
const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function adapt(delta: number, points: number, first: boolean): number {
  let d = first ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / points);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) >> 1) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

function digitOf(code: number): number {
  if (code >= 48 && code <= 57) return code - 22; // 0-9 -> 26-35
  if (code >= 97 && code <= 122) return code - 97; // a-z -> 0-25
  return -1;
}

function decodeLabel(input: string): string | null {
  const split = input.lastIndexOf("-");
  const output: number[] = [];
  for (const char of split > 0 ? input.slice(0, split) : "") {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 128) return null;
    output.push(code);
  }
  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let index = split > 0 ? split + 1 : 0;
  while (index < input.length) {
    const before = i;
    let weight = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) return null;
      const digit = digitOf(input.charCodeAt(index));
      index += 1;
      if (digit < 0) return null;
      i += digit * weight;
      const threshold = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < threshold) break;
      weight *= BASE - threshold;
      if (!Number.isSafeInteger(i) || !Number.isSafeInteger(weight)) return null;
    }
    const length = output.length + 1;
    bias = adapt(i - before, length, before === 0);
    n += Math.floor(i / length);
    i %= length;
    if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return null;
    output.splice(i, 0, n);
    i += 1;
  }
  // A real internationalised label has at least one non-ASCII character.
  return output.some((code) => code >= 128) ? String.fromCodePoint(...output) : null;
}

export function unicodeHostname(hostname: string): string {
  return hostname
    .split(".")
    .map((label) => {
      if (!label.toLowerCase().startsWith("xn--")) return label;
      const decoded = decodeLabel(label.slice(4).toLowerCase());
      return decoded === null || decoded === "" ? label : decoded;
    })
    .join(".");
}
