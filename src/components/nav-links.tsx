"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Labels arrive as props from the server header, so the client bundle carries no message catalogue.
export function NavLinks({ label, items }: { label: string; items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      {/* The links carry 12px of inline padding; pull the list back so their text lines up with the wordmark. */}
      <ul className="-ms-3 flex gap-2 md:ms-0">
        {items.map(({ href, label: itemLabel }) => {
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
