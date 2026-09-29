import { describe, expect, it } from "vitest";

import { COLLECTION_NAMES, COLLECTIONS, isCollectionName } from "@/data-schema/records/collections";

describe("collection registry", () => {
  it("lists the 13 collections in contract order", () => {
    expect(COLLECTION_NAMES).toEqual([
      "countries",
      "fields",
      "subjects",
      "language-certificates",
      "grading-scales",
      "grade-conversions",
      "credential-types",
      "application-channels",
      "admission-routes",
      "institutions",
      "programs",
      "cost-profiles",
      "scholarships",
    ]);
  });

  it("uses code as the id key only for countries", () => {
    const codeKeyed = COLLECTION_NAMES.filter((name) => COLLECTIONS[name].idKey === "code");
    expect(codeKeyed).toEqual(["countries"]);
  });

  it("recognises collection names", () => {
    expect(isCollectionName("programs")).toBe(true);
    expect(isCollectionName("program")).toBe(false);
    expect(isCollectionName("constructor")).toBe(false);
  });
});
