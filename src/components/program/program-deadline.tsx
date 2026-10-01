"use client";

// Client leaf: "next deadline" or "closed" depends on today, which only the browser knows. The box keeps its minimum height before and after mount so the column does not jump.
import { useEffect, useState } from "react";

import { DeadlineStatus } from "@/components/deadline-status";
import type { IsoDate } from "@/data-schema/dates";
import type { Program } from "@/data-schema/resolved";
import { nextIntake } from "@/domain/intakes";
import { todayIso } from "@/lib/clock";

export function ProgramDeadline({ program }: { program: Pick<Program, "slug" | "intakes"> }) {
  const [today, setToday] = useState<IsoDate | null>(null);
  useEffect(() => {
    setToday(todayIso());
  }, []);

  return (
    <div data-slot="program-deadline" className="min-h-24">
      {today === null ? null : <DeadlineStatus intake={nextIntake(program, today)} />}
    </div>
  );
}
