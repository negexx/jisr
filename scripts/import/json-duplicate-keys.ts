// JSON.parse silently keeps the last of two equal keys. This scans the text and returns the
// top-level keys (the direct children of the root object) that appear more than once, so a
// registry with a repeated university name can be refused instead of losing one of them.
export function duplicateTopLevelKeys(text: string): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (ch === '"') {
      let end = i + 1;
      while (end < text.length && text.charAt(end) !== '"')
        end += text.charAt(end) === "\\" ? 2 : 1;
      if (depth === 1 && /^\s*:/.test(text.slice(end + 1, end + 40))) {
        const key = JSON.parse(text.slice(i, end + 1)) as string;
        if (seen.has(key)) repeated.add(key);
        seen.add(key);
      }
      i = end;
    }
    i++;
  }
  return [...repeated];
}
