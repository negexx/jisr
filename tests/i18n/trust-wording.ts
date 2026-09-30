import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

export type Locale = "fr" | "en" | "ar";
export const LOCALES: readonly Locale[] = ["fr", "en", "ar"];

type Tree = { [key: string]: string | Tree };
const CATALOGS: Record<Locale, Tree> = { fr, en, ar };

function flatten(tree: Tree, prefix: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}.${key}`;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

// Every message of the given top-level namespaces, keyed by its full path (`matchCard.seeDetails`).
export function namespaceMessages(locale: Locale, namespaces: readonly string[]) {
  const out = new Map<string, string>();
  for (const namespace of namespaces) {
    const subtree = CATALOGS[locale][namespace];
    if (subtree === undefined || typeof subtree === "string") {
      throw new Error(`no ${namespace} namespace in ${locale}`);
    }
    for (const [key, value] of flatten(subtree, namespace)) out.set(key, value);
  }
  return out;
}

export function placeholderNames(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].flatMap((match) => match[1] ?? []);
}
