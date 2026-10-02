import type { IsoDate } from "@/data-schema/dates";
import { compareIso } from "@/data-schema/dates";
import type { Intake, MonthDay } from "@/data-schema/records/program";
import type { Program } from "@/data-schema/resolved";
import { toFactRef } from "./facts";
import type { IntakeStatus } from "./types";

const key = ({ month, day }: MonthDay): number => month * 100 + day;

// The recurring deadline whose next occurrence is soonest from `now`, comparing month and day only.
function soonest(deadlines: readonly MonthDay[], now: IsoDate): MonthDay {
  const today = Number(now.slice(5, 7)) * 100 + Number(now.slice(8, 10));
  const rank = (d: MonthDay): number => (key(d) >= today ? key(d) : key(d) + 1200);
  return deadlines.reduce((best, d) => (rank(d) < rank(best) ? d : best));
}

export function nextIntake(program: Pick<Program, "slug" | "intakes">, now: IsoDate): IntakeStatus {
  const fact = toFactRef(`programs/${program.slug}`, "intakes", program.intakes, now);
  const intakes = program.intakes.value;
  const recurring = (intakes ?? []).flatMap((i) =>
    i.recurringDeadline === undefined ? [] : [i.recurringDeadline],
  );
  if (
    intakes === null ||
    (recurring.length === 0 && intakes.every((i) => i.applicationDeadline === null))
  ) {
    return { kind: "unknown", fact };
  }

  let earliest: Intake | null = null;
  for (const intake of intakes) {
    const deadline = intake.applicationDeadline;
    if (deadline === null || compareIso(deadline, now) < 0) continue;
    if (
      earliest === null ||
      earliest.applicationDeadline === null ||
      compareIso(deadline, earliest.applicationDeadline) < 0
    ) {
      earliest = intake;
    }
  }
  if (earliest !== null) return { kind: "upcoming", intake: earliest, fact };
  if (recurring.length > 0) return { kind: "recurring", deadline: soonest(recurring, now), fact };
  return { kind: "closed", fact };
}
