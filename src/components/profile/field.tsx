import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { TextLookupNote } from "@/lib/snapshot/text";
import { cn } from "@/lib/utils";

import type { Choice } from "./display-names";
import { AlertIcon } from "./icons";
import { fieldIdForPath } from "./issues";

// Text controls are 48px tall (phone tap target) with a border that meets 3:1 against the page.
export const CONTROL_CLASS =
  "h-12 w-full min-w-0 scroll-mb-28 rounded-lg border border-input bg-background px-3 text-base text-foreground aria-invalid:border-2 aria-invalid:border-destructive";

export type ControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

// The sentence for a note about the text shown, or undefined when there is nothing to say.
export function useNoteText(): (note: TextLookupNote) => string | undefined {
  const t = useTranslations("domain.textNote");
  return (note) => (note === "none" ? undefined : t(note));
}

type Extras = {
  hint?: ReactNode;
  // Sentences that apply to the current value; blanks are dropped, and no element exists without any.
  notes?: readonly (string | undefined)[];
  // What the current choice looks like in full (for example an official name and its gloss).
  detail?: ReactNode;
  error?: string;
};

function wiring(id: string, { hint, notes = [], detail, error }: Extras) {
  const lines = notes.filter((line): line is string => line !== undefined && line !== "");
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const noteId = lines.length === 0 ? undefined : `${id}-note`;
  const detailId = detail === undefined || detail === null ? undefined : `${id}-detail`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, detailId, noteId, errorId].filter(Boolean).join(" ");
  return {
    lines,
    hintId,
    noteId,
    detailId,
    errorId,
    describedBy: describedBy === "" ? undefined : describedBy,
  };
}

function RequirementTag({ requirement }: { requirement: "required" | "optional" }) {
  const t = useTranslations("profile.common");
  return <span className="font-normal text-muted-foreground"> ({t(requirement)})</span>;
}

function Below({
  ids,
  detail,
  error,
}: {
  ids: ReturnType<typeof wiring>;
  detail: ReactNode;
  error: string | undefined;
}) {
  return (
    <>
      {ids.detailId === undefined ? null : (
        <p id={ids.detailId} className="text-sm">
          {detail}
        </p>
      )}
      {ids.noteId === undefined ? null : (
        <p id={ids.noteId} className="text-sm text-muted-foreground">
          {ids.lines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      )}
      {ids.errorId === undefined || error === undefined ? null : (
        <p
          id={ids.errorId}
          className="flex items-start gap-2 text-base font-medium text-destructive"
        >
          <AlertIcon className="mt-1 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </>
  );
}

function Hint({ id, hint }: { id: string | undefined; hint: ReactNode }) {
  return hint === undefined ? null : (
    <p id={id} className="text-sm text-muted-foreground">
      {hint}
    </p>
  );
}

type FieldProps = Extras & {
  path: string;
  label: ReactNode;
  requirement: "required" | "optional";
  children: (control: ControlProps) => ReactNode;
};

export function Field({ path, label, requirement, children, ...extras }: FieldProps) {
  const id = fieldIdForPath(path);
  const ids = wiring(id, extras);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-medium">
        {label}
        <RequirementTag requirement={requirement} />
      </label>
      <Hint id={ids.hintId} hint={extras.hint} />
      {children({
        id,
        "aria-describedby": ids.describedBy,
        "aria-invalid": extras.error === undefined ? undefined : true,
      })}
      <Below ids={ids} detail={extras.detail} error={extras.error} />
    </div>
  );
}

type FieldGroupProps = Extras & {
  path: string;
  legend: ReactNode;
  requirement: "required" | "optional";
  // Rows of radios or checkboxes give their first input this id; other groups take it themselves
  // so that a link from the error summary has something to focus.
  ownsId?: boolean;
  children: ReactNode;
};

export function FieldGroup({
  path,
  legend,
  requirement,
  ownsId = true,
  children,
  ...extras
}: FieldGroupProps) {
  const id = fieldIdForPath(path);
  const ids = wiring(id, extras);
  return (
    <fieldset
      id={ownsId ? id : undefined}
      tabIndex={ownsId ? -1 : undefined}
      aria-describedby={ids.describedBy}
      className="flex min-w-0 flex-col gap-1.5 outline-none"
    >
      <legend className="mb-1.5 p-0 text-base font-medium">
        {legend}
        <RequirementTag requirement={requirement} />
      </legend>
      <Hint id={ids.hintId} hint={extras.hint} />
      {children}
      <Below ids={ids} detail={extras.detail} error={extras.error} />
    </fieldset>
  );
}

export function NativeSelect({
  control,
  value,
  choices,
  placeholder,
  onChange,
  className,
}: {
  control: ControlProps;
  value: string;
  choices: readonly Choice[];
  // Omitted when the control always has a sensible value (currency, period): no blank choice.
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  // A stored value the list no longer offers reads as "nothing chosen"; validation names it.
  const shown = choices.some((choice) => choice.value === value) ? value : "";
  return (
    <select
      {...control}
      value={placeholder === undefined && shown === "" ? (choices[0]?.value ?? "") : shown}
      onChange={(event) => onChange(event.target.value)}
      className={cn(CONTROL_CLASS, className)}
    >
      {placeholder === undefined ? null : <option value="">{placeholder}</option>}
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

// A row people can tap anywhere on: the whole label is the target, not the small native control.
export function ChoiceGroup({
  path,
  name,
  kind,
  legend,
  requirement,
  hint,
  notes,
  error,
  choices,
  selected,
  onToggle,
  columns = false,
}: Extras & {
  path: string;
  name: string;
  kind: "radio" | "checkbox";
  legend: ReactNode;
  requirement: "required" | "optional";
  choices: readonly Choice[];
  selected: readonly string[];
  onToggle: (value: string, checked: boolean) => void;
  columns?: boolean;
}) {
  const firstId = fieldIdForPath(path);
  return (
    <FieldGroup
      path={path}
      legend={legend}
      requirement={requirement}
      hint={hint}
      notes={notes}
      error={error}
      ownsId={false}
    >
      <div className={cn("grid gap-2", columns && "sm:grid-cols-2")}>
        {choices.map((choice, index) => (
          <label
            key={choice.value}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-input bg-background px-3 py-2 text-base has-checked:border-primary has-checked:bg-accent"
          >
            <input
              type={kind}
              name={name}
              id={index === 0 ? firstId : undefined}
              value={choice.value}
              checked={selected.includes(choice.value)}
              aria-invalid={error === undefined ? undefined : true}
              onChange={(event) => onToggle(choice.value, event.target.checked)}
              className="size-5 shrink-0 accent-primary"
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
    </FieldGroup>
  );
}
