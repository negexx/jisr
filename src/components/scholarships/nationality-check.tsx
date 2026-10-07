"use client";

// Client leaf: the only profile-dependent part of the Scholarships page. The server HTML holds a
// neutral, height-reserving placeholder; the nationality is read from this device after mount.
// It judges the published nationality rule only and says so (no other eligibility claim).
import { CircleCheck, CircleHelp, CircleX } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { useProfile } from "@/lib/profile/use-profile";

export type NationalityCheckLabels = {
  open: string;
  closed: string;
  noProfile: string;
  caveat: string;
};

export function NationalityCheck({
  eligible,
  labels,
}: {
  eligible: readonly string[];
  labels: NationalityCheckLabels;
}) {
  const { state } = useProfile();

  if (state.status === "unhydrated") {
    return <p data-testid="nationality-check" data-state="placeholder" className="min-h-11" />;
  }
  if (state.status !== "ok") {
    return (
      <p
        data-testid="nationality-check"
        data-state="none"
        className="flex min-h-11 items-center gap-2 text-base"
      >
        <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
        <Link
          href="/profile"
          className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
        >
          {labels.noProfile}
        </Link>
      </p>
    );
  }

  const open = eligible.includes(state.profile.nationality);
  const Icon = open ? CircleCheck : CircleX;
  return (
    <div
      data-testid="nationality-check"
      data-state={open ? "open" : "closed"}
      className="flex flex-col gap-1"
    >
      <p className="flex items-start gap-2 text-base font-medium">
        <Icon aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0" />
        <span>{open ? labels.open : labels.closed}</span>
      </p>
      <p className="text-sm text-muted-foreground">{labels.caveat}</p>
    </div>
  );
}
