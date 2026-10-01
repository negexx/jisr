import type { DataText } from "@/lib/snapshot/text";

import { useNoteText } from "./field";

// An official name is shown as published, isolated from the surrounding text direction. Its gloss is
// secondary, in parentheses, and the note about it ("shown in French", "translated automatically")
// sits after the closing parenthesis on its own line.
export function OfficialName({ name, gloss }: { name: string; gloss: DataText | undefined }) {
  const noteText = useNoteText();
  const note = gloss === undefined ? undefined : noteText(gloss.note);
  return (
    <>
      <bdi>{name}</bdi>
      {gloss === undefined ? null : (
        <span className="text-muted-foreground">
          {" ("}
          <bdi lang={gloss.note === "french_fallback" ? "fr" : undefined}>{gloss.text}</bdi>
          {")"}
        </span>
      )}
      {note === undefined ? null : <span className="block text-muted-foreground">{note}</span>}
    </>
  );
}
