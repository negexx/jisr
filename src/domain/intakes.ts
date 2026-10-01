import type { IsoDate } from "@/data-schema/dates";
import { compareIso } from "@/data-schema/dates";
import type { Intake } from "@/data-schema/records/program";
import type { Program } from "@/data-schema/resolved";
import { toFactRef } from "./facts";
import type { IntakeStatus } from "./types";

export function nextIntake(program: Pick<Program, "slug" | "intakes">, now: IsoDate): IntakeStatus {
  const fact = toFactRef(`programs/${program.slug}`, "intakes", program.intakes, now);
  const intakes = program.intakes.value;
  if (intakes === null || intakes.every((i) => i.applicationDeadline === null)) {
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
  return earliest === null
    ? { kind: "closed", fact }
    : { kind: "upcoming", intake: earliest, fact };
}
