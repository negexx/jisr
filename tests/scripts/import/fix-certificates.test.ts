import { describe, expect, it } from "vitest";

import { fixRules } from "../../../scripts/import/fix-certificates";

const rule = (extra: Record<string, unknown>) => ({
  id: "req-1",
  kind: "language_proficiency",
  language: "en",
  minCefr: "B2",
  certificateRequired: true,
  acceptedTests: [],
  ...extra,
});

describe("fixRules", () => {
  it("turns 'certificate required, no tests named' into 'unknown' and counts it", () => {
    const { record, changed } = fixRules({
      slug: "s",
      requirements: { coverage: "partial", rules: [rule({})] },
    });
    expect(changed).toBe(1);
    const rules = (record.requirements as { rules: { certificateRequired: unknown }[] }).rules;
    expect(rules[0]?.certificateRequired).toBeNull();
  });

  it("changes nothing when the tests are named or no certificate is needed", () => {
    const input = {
      slug: "s",
      requirements: {
        rules: [rule({ acceptedTests: ["ielts"] }), rule({ certificateRequired: false })],
      },
    };
    expect(fixRules(input).changed).toBe(0);
  });

  it("is a no-op for a record without requirements", () => {
    expect(fixRules({ slug: "s" })).toEqual({ record: { slug: "s" }, changed: 0 });
  });

  it("leaves manual_check rules and the other fields untouched", () => {
    const manual = {
      id: "req-2",
      kind: "manual_check",
      note: { fr: { text: "x", status: "draft" } },
    };
    const { record } = fixRules({
      slug: "s",
      name: "N",
      requirements: { rules: [rule({}), manual] },
    });
    expect(record.name).toBe("N");
    expect((record.requirements as { rules: unknown[] }).rules[1]).toEqual(manual);
  });
});
