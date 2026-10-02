"use client";

import { Bookmark } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { MAX_SAVED_PROGRAMS } from "@/lib/constants";
import { useSaved } from "@/lib/saved/use-saved";

// Every string is a prop: the button sits on the program page header (a server component under a
// provider with no messages) and in the match cards (a provider with a short namespace list).
export type SaveCopy = {
  save: string;
  saved: string;
  announceSaved: string;
  announceRemoved: string;
  full: string;
};

// The static HTML knows nothing about what the student saved, so the server output is an inert
// placeholder with the button's footprint; the real button replaces it after hydration.
export function SaveProgramButton({
  program,
  snapshotVersion,
  programName,
  copy,
}: {
  program: { slug: string; country: string; field: string };
  snapshotVersion: string;
  // The official name, read by screen readers after the visible label (the bookmark carries no text).
  programName: string;
  copy: SaveCopy;
}) {
  const { hydrated, items, isSaved, toggle } = useSaved();
  const [message, setMessage] = useState<string | null>(null);
  // How many times a save was refused because the list is full (0: none since the last success).
  // The count keys the alert, so each refusal inserts a fresh one and is announced again.
  const [refusals, setRefusals] = useState(0);

  if (!hydrated) {
    return (
      <span data-slot="save-placeholder" aria-hidden="true" className="inline-block h-12 w-32" />
    );
  }

  const saved = isSaved(program.slug);
  // The complaint is only true while the list is still full and this program is not on it.
  const stillFull = !saved && items.length >= MAX_SAVED_PROGRAMS;
  if (refusals > 0 && !stillFull) {
    // Adjusting state during render: forget the refusal as soon as it stops being true, so it does
    // not come back if the list fills up again later.
    setRefusals(0);
  }
  const showFull = refusals > 0 && stillFull;

  function onClick() {
    const result = toggle(program, snapshotVersion);
    if (!result.ok) {
      setRefusals((count) => count + 1);
      setMessage(null);
      return;
    }
    setRefusals(0);
    setMessage(result.saved ? copy.announceSaved : copy.announceRemoved);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* The visible label itself changes between save and saved, so there is no aria-pressed. */}
      <Button type="button" variant="outline" className="min-w-32" onClick={onClick}>
        <Bookmark aria-hidden="true" className={saved ? "fill-current" : undefined} />
        {/* The space after the label keeps the accessible name readable: the name follows, unseen. */}
        {saved ? copy.saved : copy.save}{" "}
        <span className="sr-only">
          <bdi>{programName}</bdi>
        </span>
      </Button>
      {/* One polite region for the life of the button: only its text changes, so it is announced. */}
      <output className="sr-only">{message}</output>
      {showFull ? (
        <p key={refusals} role="alert" className="max-w-prose text-sm text-muted-foreground">
          {copy.full}
        </p>
      ) : null}
    </div>
  );
}
