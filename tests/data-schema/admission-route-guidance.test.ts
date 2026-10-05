import { describe, expect, it } from "vitest";

import { AdmissionRouteRecordSchema } from "@/data-schema/records/admission-route";

const note = (text: string) => ({ fr: { text, status: "draft" as const } });
const guidance = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  source: "main",
  info_kind: "guidance",
  note: note("Note"),
  ...extra,
});
const route = (extra: Record<string, unknown> = {}) => ({
  slug: "xx-test-route",
  origin: "XA",
  credentialType: "xx-test-cred",
  destination: "XB",
  level: "bachelor",
  outcome: "direct",
  applicationChannels: ["xx-test-channel"],
  source: "main",
  info_kind: "official",
  sources: { main: { url: "https://example.org/x", last_verified_at: "2026-09-01" } },
  ...extra,
});

describe("admission route guidance", () => {
  it("defaults to no guidance", () => {
    const parsed = AdmissionRouteRecordSchema.parse(route());
    expect(parsed.guidance).toEqual([]);
  });

  it("accepts guidance items with distinct ids", () => {
    const parsed = AdmissionRouteRecordSchema.safeParse(
      route({ guidance: [guidance("xx-test-a"), guidance("xx-test-b")] }),
    );
    expect(parsed.success).toBe(true);
  });

  it("refuses duplicate ids", () => {
    const parsed = AdmissionRouteRecordSchema.safeParse(
      route({ guidance: [guidance("xx-test-a"), guidance("xx-test-a")] }),
    );
    expect(parsed.success).toBe(false);
  });

  it.each([
    "official",
    "estimate",
  ])("refuses info_kind %s: guidance can never claim more", (kind) => {
    const parsed = AdmissionRouteRecordSchema.safeParse(
      route({ guidance: [guidance("xx-test-a", { info_kind: kind })] }),
    );
    expect(parsed.success).toBe(false);
  });

  it("refuses an item without a note, or with a rule kind", () => {
    expect(
      AdmissionRouteRecordSchema.safeParse(
        route({ guidance: [{ ...guidance("xx-test-a"), note: undefined }] }),
      ).success,
    ).toBe(false);
    expect(
      AdmissionRouteRecordSchema.safeParse(
        route({ guidance: [guidance("xx-test-a", { kind: "manual_check" })] }),
      ).success,
    ).toBe(false);
  });
});
