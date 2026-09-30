import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { TextLookupNote } from "@/lib/snapshot/text";
import { cn } from "@/lib/utils";

import type { Choice } from "./display-names";
import { fieldIdForPath } from "./issues";

// Text controls are 48px tall (phone tap target) with a border that meets 3:1 against the page.
export const CONTROL_CLASS =
  "h-12 w-full min-w-0 scroll-mb-28 rounded-lg border border-input bg-background px-3 text-base text-foreground aria-invalid:border-2 aria-invalid:border-destructive";

export type ControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

function joinIds(...ids: (string | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined === "" ? undefined : joined;
}

function RequirementTag({ requirement }: { requirement: "required" | "optional" }) {
  const t = useTranslations("profile.common");
  return <span className="font-normal text-muted-foreground"> ({t(requirement)})</span>;
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="flex items-start gap-2 text-base font-medium text-destructive">
      <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

// Shown once per field when an option label came from the French fallback or a machine draft.
export function TextNote({ note }: { note: TextLookupNote }) {
  const t = useTranslations("domain.textNote");
  if (note === "none") return null;
  return <span>{t(note)}</span>;
}

type FieldProps = {
  path: string;
  label: ReactNode;
  requirement: "required" | "optional";
  hint?: ReactNode;
  note?: ReactNode;
  error?: string;
  children: (control: ControlProps) => ReactNode;
};

export function Field({ path, label, requirement, hint, note, error, children }: FieldProps) {
  const id = fieldIdForPath(path);
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const noteId = note === undefined || note === null || note === false ? undefined : `${id}-note`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-medium">
        {label}
        <RequirementTag requirement={requirement} />
      </label>
      {hint === undefined ? null : (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {children({
        id,
        "aria-describedby": joinIds(hintId, noteId, errorId),
        "aria-invalid": error === undefined ? undefined : true,
      })}
      {noteId === undefined ? null : (
        <p id={noteId} className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
      {errorId === undefined || error === undefined ? null : (
        <FieldError id={errorId} message={error} />
      )}
    </div>
  );
}

type FieldGroupProps = {
  path: string;
  legend: ReactNode;
  requirement: "required" | "optional";
  hint?: ReactNode;
  note?: ReactNode;
  error?: string;
  children: ReactNode;
};

export function FieldGroup({
  path,
  legend,
  requirement,
  hint,
  note,
  error,
  children,
}: FieldGroupProps) {
  const id = fieldIdForPath(path);
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const noteId = note === undefined || note === null || note === false ? undefined : `${id}-note`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  return (
    <fieldset
      aria-describedby={joinIds(hintId, noteId, errorId)}
      className="flex min-w-0 flex-col gap-1.5"
    >
      <legend className="mb-1.5 p-0 text-base font-medium">
        {legend}
        <RequirementTag requirement={requirement} />
      </legend>
      {hint === undefined ? null : (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {children}
      {noteId === undefined ? null : (
        <p id={noteId} className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
      {errorId === undefined || error === undefined ? null : (
        <FieldError id={errorId} message={error} />
      )}
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
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  // A stored value the list no longer offers reads as "nothing chosen"; validation names it.
  const shown = choices.some((choice) => choice.value === value) ? value : "";
  return (
    <select
      {...control}
      value={shown}
      onChange={(event) => onChange(event.target.value)}
      className={cn(CONTROL_CLASS, className)}
    >
      <option value="">{placeholder}</option>
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
  note,
  error,
  choices,
  selected,
  onToggle,
  columns = false,
}: {
  path: string;
  name: string;
  kind: "radio" | "checkbox";
  legend: ReactNode;
  requirement: "required" | "optional";
  hint?: ReactNode;
  note?: ReactNode;
  error?: string;
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
      note={note}
      error={error}
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
