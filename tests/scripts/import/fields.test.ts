import { describe, expect, it } from "vitest";
import { classifyDutchProgramme } from "../../../scripts/import/fields";

describe("classifyDutchProgramme health names", () => {
  it("maps geneeskunde to medicine", () => {
    expect(classifyDutchProgramme("GEZONDHEIDSZORG", "Geneeskunde", "Medicine")?.field).toBe(
      "medicine",
    );
  });
  it("maps farmacie to pharmacy", () => {
    expect(classifyDutchProgramme("GEZONDHEIDSZORG", "Farmacie", "Pharmacy")?.field).toBe(
      "pharmacy",
    );
  });
  it("maps verpleegkunde and fysiotherapie to allied-health", () => {
    expect(classifyDutchProgramme("GEZONDHEIDSZORG", "Verpleegkunde", "Nursing")?.field).toBe(
      "allied-health",
    );
    expect(classifyDutchProgramme("GEZONDHEIDSZORG", "Fysiotherapie", "Physiotherapy")?.field).toBe(
      "allied-health",
    );
  });
  it("maps biomedische wetenschappen to allied-health, never medicine", () => {
    expect(
      classifyDutchProgramme("NATUUR", "Biomedische wetenschappen", "Biomedical Sciences")?.field,
    ).toBe("allied-health");
  });
});
