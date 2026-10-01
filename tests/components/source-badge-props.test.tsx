// @vitest-environment jsdom
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SourceBadge } from "@/components/source-badge";
import type { FactRef } from "@/domain/types";

import { renderWithMessages } from "./trust-helpers";

// FreshnessMark is the client leaf: whatever SourceBadge passes it is serialised into the static page.
const sent = vi.hoisted(() => ({ props: [] as unknown[] }));
vi.mock("@/components/freshness-mark", () => ({
  FreshnessMark: (props: unknown) => {
    sent.props.push(props);
    return null;
  },
}));

afterEach(() => {
  cleanup();
  sent.props = [];
});

const REF: FactRef = {
  record: "cost-profiles/xx-test-costs-xb",
  path: "lines.housing",
  source_url: "https://example.org/xx-test",
  last_verified_at: "2026-09-01",
  info_kind: "estimate",
  class: "stable",
  // Stamped by the domain at some `now`: a build-time value that must never reach the page.
  freshness: "fresh",
  basis: "cost-profiles/xx-test-costs-xb#lines.housing.basis",
};

describe("SourceBadge props sent to the client leaf", () => {
  it("sends only the FactMeta fields, never a precomputed freshness", () => {
    renderWithMessages(<SourceBadge meta={REF} />, "fr");
    expect(sent.props).toHaveLength(1);
    const serialised = JSON.stringify(sent.props[0]);
    expect(serialised).not.toContain('"freshness"');
    expect(serialised).not.toContain('"record"');
    expect(serialised).not.toContain('"path"');
    expect((sent.props[0] as { meta: unknown }).meta).toEqual({
      source_url: REF.source_url,
      info_kind: REF.info_kind,
      last_verified_at: REF.last_verified_at,
      class: REF.class,
      basis: REF.basis,
    });
  });

  it("omits basis when the fact has none", () => {
    const { basis: _basis, ...withoutBasis } = REF;
    renderWithMessages(<SourceBadge meta={withoutBasis} />, "fr");
    expect(Object.keys((sent.props[0] as { meta: object }).meta).sort()).toEqual([
      "class",
      "info_kind",
      "last_verified_at",
      "source_url",
    ]);
  });
});
