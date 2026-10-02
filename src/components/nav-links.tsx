"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useSaved } from "@/lib/saved/use-saved";
import { cn } from "@/lib/utils";

// `savedCount.template` is the item's message with a `{count}` placeholder, filled in here with
// the number of saved programs (read from this device after mount, so the static HTML has no badge).
export type NavItem = { href: string; label: string; savedCount?: { template: string } };

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Labels arrive as props from the server header, so the client bundle carries no message catalogue.
export function NavLinks({ label, items }: { label: string; items: readonly NavItem[] }) {
  const pathname = usePathname();
  const { hydrated, items: saved } = useSaved();
  const count = hydrated ? saved.length : 0;
  return (
    <nav aria-label={label}>
      {/* The links carry 12px of inline padding; pull the list back so their text lines up with the wordmark. */}
      <ul className="-ms-3 flex gap-2 md:ms-0">
        {items.map(({ href, label: itemLabel, savedCount }) => {
          const current = isCurrent(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center border-b-2 px-3 text-base font-medium transition-colors",
                  current
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {itemLabel}
                {savedCount !== undefined && count > 0 ? (
                  <>
                    {" "}
                    <span
                      aria-hidden="true"
                      className="ms-2 rounded-full bg-muted px-2 text-sm tabular-nums"
                    >
                      {count}
                    </span>
                    <span className="sr-only">
                      {savedCount.template.replace("{count}", String(count))}
                    </span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
