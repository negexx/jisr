import { describe, expect, it } from "vitest";

import {
  FEEDBACK_NOTE_MAX_LENGTH,
  FEEDBACK_PATH_MAX_LENGTH,
  FEEDBACK_RECORD_MAX_LENGTH,
  FEEDBACK_SOURCE_URL_MAX_LENGTH,
} from "@/db/schema/app";
import {
  FEEDBACK_NOTE_LIMIT,
  FEEDBACK_PATH_LIMIT,
  FEEDBACK_RECORD_LIMIT,
  FEEDBACK_SOURCE_URL_LIMIT,
  FeedbackInputSchema,
  PROFILE_JSON_LIMIT,
  SLUG_MAX_LENGTH,
} from "@/lib/server/account-inputs";

describe("account input bounds", () => {
  it("are strictly tighter than the column bounds they guard", () => {
    expect(FEEDBACK_NOTE_LIMIT).toBeLessThan(FEEDBACK_NOTE_MAX_LENGTH);
    expect(FEEDBACK_RECORD_LIMIT).toBeLessThan(FEEDBACK_RECORD_MAX_LENGTH);
    expect(FEEDBACK_PATH_LIMIT).toBeLessThan(FEEDBACK_PATH_MAX_LENGTH);
    expect(FEEDBACK_SOURCE_URL_LIMIT).toBeLessThan(FEEDBACK_SOURCE_URL_MAX_LENGTH);
  });

  it("keep slugs and the profile document bounded", () => {
    expect(SLUG_MAX_LENGTH).toBeLessThanOrEqual(120);
    expect(PROFILE_JSON_LIMIT).toBeLessThanOrEqual(32_768);
  });

  it("accept a note exactly at the limit and refuse one past it", () => {
    const base = {
      record: "programs/xx-test-prog",
      path: "requirements.rules.r-math",
      sourceUrl: "https://example.org/a",
      snapshotVersion: "0123456789ab",
    };
    const note = (length: number) =>
      FeedbackInputSchema.safeParse({ ...base, note: "n".repeat(length) });
    expect(note(FEEDBACK_NOTE_LIMIT).success).toBe(true);
    expect(note(FEEDBACK_NOTE_LIMIT + 1).success).toBe(false);
  });
});
