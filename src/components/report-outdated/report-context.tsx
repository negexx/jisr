"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

import type { AppLocale } from "@/i18n/routing";

import type { ReportFactKey } from "./report-fact";

export type ReportCopy = {
  button: string;
  reported: string;
  failed: string;
  rateLimited: string;
  // Between the button's label and the fact it reports, in the accessible name only.
  nameSeparator: string;
  facts: Record<ReportFactKey, string>;
};

// `snapshotVersion` stays null until the page knows which snapshot its facts came from; a button
// without one does not render, since a report must name the version the student saw.
export type ReportScope = {
  copy: ReportCopy;
  locale: AppLocale;
  snapshotVersion: string | null;
};

export type ReportTarget = { record: string; path: string };

const ReportContext = createContext<ReportScope | null>(null);

export function useReportScope(): ReportScope | null {
  return useContext(ReportContext);
}

export function ReportProvider({
  copy,
  locale,
  snapshotVersion,
  children,
}: ReportScope & { children: ReactNode }) {
  const scope = useMemo(() => ({ copy, locale, snapshotVersion }), [copy, locale, snapshotVersion]);
  return <ReportContext.Provider value={scope}>{children}</ReportContext.Provider>;
}

// For the client trees that learn their snapshot version in the browser. With no provider above
// (accounts off, or a page that offers no reporting) it renders its children untouched.
export function ReportSnapshot({
  version,
  children,
}: {
  version: string | null;
  children: ReactNode;
}) {
  const outer = useContext(ReportContext);
  const scope = useMemo(
    () => (outer === null ? null : { ...outer, snapshotVersion: version }),
    [outer, version],
  );
  return scope === null ? (
    children
  ) : (
    <ReportContext.Provider value={scope}>{children}</ReportContext.Provider>
  );
}
