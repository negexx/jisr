import { describe, expect, it } from "vitest";

import { pickMessages } from "@/lib/i18n/client-messages";

const messages = {
  home: { title: "Home", steps: { profile: "Profile" } },
  domain: {
    status: { satisfied: "Met", check: "Check" },
    cost: { missingLine: "Not published" },
  },
  profile: { steps: { bac: "Bac", languages: "Languages" }, title: "Profile" },
};

describe("pickMessages", () => {
  it("keeps only the requested top-level namespace", () => {
    expect(pickMessages(messages, ["domain"])).toEqual({ domain: messages.domain });
  });

  it("keeps the nested path and drops its siblings", () => {
    expect(pickMessages(messages, ["profile.steps"])).toEqual({
      profile: { steps: { bac: "Bac", languages: "Languages" } },
    });
  });

  it("merges several namespaces, including ones that share a parent", () => {
    expect(pickMessages(messages, ["profile.steps", "domain.status", "home"])).toEqual({
      profile: { steps: messages.profile.steps },
      domain: { status: messages.domain.status },
      home: messages.home,
    });
  });

  it("lets a parent and its child both be requested", () => {
    expect(pickMessages(messages, ["domain.status", "domain"])).toEqual({
      domain: messages.domain,
    });
  });

  it("returns an empty object for no namespaces", () => {
    expect(pickMessages(messages, [])).toEqual({});
  });

  it("does not mutate the input", () => {
    const snapshot = structuredClone(messages);
    pickMessages(messages, ["domain", "profile.steps"]);
    expect(messages).toEqual(snapshot);
  });

  it("returns a copy: changing the result leaves the input untouched", () => {
    const picked = pickMessages(messages, ["domain"]);
    const domain = picked.domain;
    if (typeof domain !== "object") throw new Error("expected a namespace");
    domain.extra = "x";
    expect("extra" in messages.domain).toBe(false);
  });

  it.each([
    ["nope", /"nope"/],
    ["domain.nope", /"domain\.nope"/],
    ["home.steps.profile.deeper", /"home\.steps\.profile\.deeper"/],
  ])("throws an error naming the unknown namespace %s", (namespace, message) => {
    expect(() => pickMessages(messages, [namespace])).toThrow(message);
  });

  it("throws when the namespace is a single message, not a namespace", () => {
    expect(() => pickMessages(messages, ["home.title"])).toThrow(/"home\.title".*not a namespace/);
  });

  it("throws on an empty namespace", () => {
    expect(() => pickMessages(messages, [""])).toThrow(/empty/i);
  });
});
