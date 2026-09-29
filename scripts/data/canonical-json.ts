export class CanonicalJsonError extends Error {}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function encode(value: unknown, path: string): string {
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalJsonError(`non-finite number at ${path}`);
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new CanonicalJsonError(`unsupported ${typeof value} at ${path}`);
  }
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => encode(item, `${path}[${index}]`)).join(",")}]`;
  }
  if (!isPlainObject(value)) throw new CanonicalJsonError(`unsupported object at ${path}`);
  const members = Object.entries(value)
    .filter(([, member]) => member !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, member]) => `${JSON.stringify(key)}:${encode(member, `${path}.${key}`)}`);
  return `{${members.join(",")}}`;
}

// Keys sorted by UTF-16 code unit, no whitespace, non-ASCII left unescaped: the same value always
// yields the same bytes, which is what the shard hashes are computed over.
export function canonicalJson(value: unknown): string {
  return encode(value, "$");
}
