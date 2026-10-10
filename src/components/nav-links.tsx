"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useSavedCount } from "@/lib/saved/use-saved-count";
import { cn } from "@/lib/utils";

// `savedCount.template` is the item's message with a `{count}` placeholder, filled in here with
// the number of saved programs (read from this device after mount, so the static HTML has no badge).
export type NavItem = {
  href: string;
  label: string;
  savedCount?: { template: string };
  // false: never prefetch this page's code (the link sits on every page; the page is not the likely next step)
  prefetch?: false;
};

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Labels arrive as props from the server header, so the client bundle carries no message catalogue.
export function NavLinks({ label, items }: { label: string; items: readonly NavItem[] }) {
  const pathname = usePathname();
  const count = useSavedCount();
  return (
    <nav aria-label={label}>
      {/* The links carry 8px of inline padding on phone (12px from md); pull the list back so their text lines up with the wordmark. Below lg the nav has its own row under the logo and the list wraps to a second row rather than scroll sideways when four items plus the badge do not fit (French and English at 343px). From lg the nav sits in-line beside the logo, which already supplies the gap. */}
      <ul className="-ms-2 flex flex-wrap gap-x-2 md:-ms-3 lg:ms-0">
        {items.map(({ href, label: itemLabel, savedCount, prefetch: noPrefetch }) => {
          const current = isCurrent(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                // The plan only has something to show once a program is saved, so until then its
                // page code (the biggest of the three) is not prefetched on every other page.
                prefetch={
                  noPrefetch === false || (savedCount !== undefined && count === 0)
                    ? false
                    : undefined
                }
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-12 items-center whitespace-nowrap rounded-md px-2 text-base font-medium transition-colors md:px-3",
                  "after:pointer-events-none after:absolute after:inset-x-2 after:bottom-2 after:h-0.5 after:rounded-full after:bg-primary after:transition-opacity md:after:inset-x-3",
                  current
                    ? "text-foreground after:opacity-100"
                    : "text-muted-foreground after:opacity-0 hover:bg-canvas-soft hover:text-foreground",
                )}
              >
                {itemLabel}
                {savedCount !== undefined && count > 0 ? (
                  <>
                    {" "}
                    <span
                      aria-hidden="true"
                      className="ms-1.5 rounded-full bg-muted px-1.5 text-sm tabular-nums"
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
