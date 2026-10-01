import { describe, expect, it } from "vitest";

import * as checks from "@/lib/profile/reference-checks";
import * as lookups from "@/lib/profile/reference-lookups";

import { coreShard } from "./core-fixture";

describe("reference lookups", () => {
  it("are re-exported unchanged by reference-checks", () => {
    expect(checks.certificatesFor).toBe(lookups.certificatesFor);
    expect(checks.scaleForCredentialType).toBe(lookups.scaleForCredentialType);
  });

  it("lists the certificates of one language only", () => {
    const slugs = lookups.certificatesFor("en", coreShard()).map((c) => c.slug);
    expect(slugs).toEqual(["xx-test-cert-en", "xx-test-cert-en-2"]);
    expect(lookups.certificatesFor("de", coreShard())).toEqual([]);
  });

  it("finds the grading scale of a credential type, or nothing", () => {
    expect(lookups.scaleForCredentialType("xx-test-cred", coreShard())?.slug).toBe(
      "xx-test-scale-20",
    );
    expect(lookups.scaleForCredentialType("nope", coreShard())).toBeUndefined();
  });
});
