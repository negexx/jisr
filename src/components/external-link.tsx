// Shared, no "use client": useTranslations reads the request config on the server; a client tree needs a provider that carries `externalLink`.
import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { unicodeHostname } from "@/lib/punycode";
import { cn } from "@/lib/utils";

export function sourceHostname(href: string): string | null {
  if (!href.startsWith("https://")) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.hostname !== "" ? unicodeHostname(url.hostname) : null;
  } catch {
    return null;
  }
}

export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("externalLink");
  const hostname = sourceHostname(href);
  // A link that cannot be opened safely is shown as plain text, never as a clickable anchor, and never dropped.
  if (hostname === null) {
    return <span className={className}>{children ?? <bdi dir="ltr">{href}</bdi>}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-sm text-primary underline underline-offset-4 transition-colors hover:no-underline",
        className,
      )}
    >
      {children ?? <bdi dir="ltr">{hostname}</bdi>}
      <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">{t("opensInNewTab")}</span>
    </a>
  );
}
