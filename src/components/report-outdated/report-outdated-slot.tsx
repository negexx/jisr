"use client";

import { lazy, Suspense, useState } from "react";

import { useSessionHint } from "@/lib/auth/session-hint";

import { useReportScope } from "./report-context";
import { REPORT_WRAPPER_CLASS, ReportTrigger } from "./report-trigger";

// The button's code is fetched only once a sign-in hint is present or after the first click:
// a guest's page carries just the label below, and the fact it sits beside never waits on the chunk.
const ReportButton = lazy(async () => ({
  default: (await import("./report-button")).ReportButton,
}));

type Props = {
  record: string;
  path: string;
  sourceUrl: string;
  // The source's host as the badge already computed it, for the accessible name.
  hostname: string | null;
};

// Renders nothing unless a page offers reporting: the provider is mounted only while accounts are
// on, so every other page, and every excluded surface, gets null here.
export function ReportOutdatedSlot({ record, path, sourceUrl, hostname }: Props) {
  const scope = useReportScope();
  const hint = useSessionHint();
  const [clicked, setClicked] = useState(false);
  if (scope === null || scope.snapshotVersion === null) return null;

  const trigger = (
    <span data-slot="report-outdated" className={REPORT_WRAPPER_CLASS}>
      <ReportTrigger
        label={scope.copy.button}
        hostname={hostname}
        onClick={() => setClicked(true)}
      />
    </span>
  );
  if (!hint && !clicked) return trigger;
  return (
    <Suspense fallback={trigger}>
      <ReportButton
        record={record}
        path={path}
        sourceUrl={sourceUrl}
        hostname={hostname}
        scope={scope}
        snapshotVersion={scope.snapshotVersion}
        autoStart={clicked}
      />
    </Suspense>
  );
}
