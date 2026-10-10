import type { MDXComponents } from "mdx/types";

import { ExternalLink } from "@/components/external-link";
import { Link } from "@/i18n/navigation";

const components: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold tracking-tight text-balance">{children}</h1>
  ),
  h2: ({ children }) => <h2 className="mt-8 text-xl font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 text-lg font-medium">{children}</h3>,
  p: ({ children }) => (
    <p className="mt-4 text-base leading-relaxed text-muted-foreground">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mt-4 flex list-disc flex-col gap-2 ps-5 text-base text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 flex list-decimal flex-col gap-2 ps-5 text-base text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ href, children }) =>
    typeof href === "string" && /^https?:\/\//.test(href) ? (
      <ExternalLink href={href}>{children}</ExternalLink>
    ) : (
      <Link href={typeof href === "string" ? href : "#"}>{children}</Link>
    ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
