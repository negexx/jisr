import { describe, expect, it } from "vitest";
import type { Intake } from "@/data-schema/records/program";
import { nextIntake } from "@/domain/intakes";
import { fact, NOW, program, STALE } from "../fixtures/domain/builders";

const I = (applicationDeadline: string | null, startDate = "2027-09-01"): Intake => ({
  startDate,
  applicationOpens: null,
  applicationDeadline,
});
const at = (intakes: Intake[] | null) =>
  nextIntake(program({ intakes: fact(intakes, { class: "volatile" }) }), NOW);

describe("nextIntake", () => {
  it.each([
    ["future deadline", [I("2027-01-15")], "upcoming", "2027-01-15"],
    ["deadline today is inclusive", [I(NOW)], "upcoming", NOW],
    ["deadline yesterday", [I("2026-09-28")], "closed", null],
    [
      "earliest future regardless of order",
      [I("2027-06-01", "2028-01-01"), I("2027-01-15")],
      "upcoming",
      "2027-01-15",
    ],
    ["past then future", [I("2026-01-01"), I("2027-02-01")], "upcoming", "2027-02-01"],
    ["null + past", [I(null), I("2026-01-01")], "closed", null],
    ["null + future", [I(null), I("2027-02-01")], "upcoming", "2027-02-01"],
    ["all null", [I(null), I(null)], "unknown", null],
    ["empty list", [], "unknown", null],
    ["value not published", null, "unknown", null],
  ] as const)("%s → %s", (_n, intakes, kind, deadline) => {
    const r = at(intakes === null ? null : [...intakes]);
    expect(r.kind).toBe(kind);
    expect(r.kind === "upcoming" ? r.intake.applicationDeadline : null).toBe(deadline);
    expect(r.fact).toMatchObject({
      record: "programs/xx-test-prog",
      path: "intakes",
      class: "volatile",
      freshness: "fresh",
    });
  });

  it("a stale intakes fact still returns upcoming, with the staleness visible on the FactRef", () => {
    const r = nextIntake(
      program({
        intakes: fact([I("2027-01-15")], { class: "volatile", last_verified_at: STALE }),
      }),
      NOW,
    );
    expect(r.kind).toBe("upcoming");
    expect(r.fact).toMatchObject({ path: "intakes", freshness: "stale" });
  });

  it("keeps the first intake on a deadline tie", () => {
    const r = at([I("2027-01-15", "2027-09-01"), I("2027-01-15", "2028-01-01")]);
    expect(r.kind === "upcoming" ? r.intake.startDate : null).toBe("2027-09-01");
  });
});
