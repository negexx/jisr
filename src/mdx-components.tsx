import type { MDXComponents } from "mdx/types";
import type { ReactNode } from "react";

import { ExternalLink } from "@/components/external-link";
import { Fact } from "@/components/mdx/fact";
import { GuideSteps } from "@/components/mdx/guide-steps";
import { Link } from "@/i18n/navigation";

export function MdxLink({ href, children }: { href?: string; children?: ReactNode }) {
  return typeof href === "string" && /^https?:\/\//.test(href) ? (
    <ExternalLink href={href}>{children}</ExternalLink>
  ) : (
    <Link href={typeof href === "string" ? href : "#"}>{children}</Link>
  );
}

const components: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="mt-0 text-2xl font-light tracking-tight text-balance">{children}</h1>
  ),
  h2: ({ children }) => <h2 className="mt-10 text-xl font-semibold tracking-tight">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 text-lg font-semibold">{children}</h3>,
  p: ({ children }) => <p className="mt-4 text-base text-secondary-foreground">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-4 flex list-disc flex-col gap-2 ps-5 text-base text-secondary-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 flex list-decimal flex-col gap-2 ps-5 text-base text-secondary-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-normal">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: MdxLink,
  Fact,
  GuideSteps,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
