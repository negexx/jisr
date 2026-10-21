// PreToolUse guard for Agent/Task dispatches (see "Delegating implementation" in .claude/CLAUDE.md).
// Superpowers templates dispatch implementers as `general-purpose` with a model the orchestrator
// picks, which in practice always came out as Sonnet. This routes implementation through the
// project's tiered implementer agents instead, and keeps `implementer` on its Haiku frontmatter.
// Exit 2 blocks the call and shows stderr to the model; anything else lets it through.

import { readFileSync } from "node:fs";

const IMPLEMENTERS = ["implementer", "implementer-hard", "implementer-complex"];
// "claude" is the catch-all agent type, equivalent to general-purpose.
const GENERIC = new Set(["general-purpose", "claude"]);
// Superpowers implementer and fix-round dispatches start with these verbs ("Implement Task N: …").
const IMPLEMENTATION = /^\s*(implement|fix|apply)\b/i;
const TIER = { "implementer-hard": "sonnet", "implementer-complex": "opus" };

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const tool = input?.tool_input ?? {};
const type = tool.subagent_type || "general-purpose";
const model = typeof tool.model === "string" ? tool.model.toLowerCase() : "";
const description = String(tool.description ?? "");

if (GENERIC.has(type) && IMPLEMENTATION.test(description)) {
  process.stderr.write(
    `Blocked: implementation work goes to a tiered implementer agent, not "${type}". ` +
      `Re-dispatch with subagent_type "implementer" (Haiku 5.5, max; the default for low-to-medium steps), ` +
      `"implementer-hard" (Sonnet 5.5) for matching/eligibility/costs/Zod/importers or multi-module steps, ` +
      `or "implementer-complex" (Opus 5.5) for architectural or very long steps. ` +
      `Keep the superpowers implementer prompt as the prompt and omit "model" so the agent's frontmatter applies.\n`,
  );
  process.exit(2);
}

if (type === "implementer" && model && !model.includes("haiku")) {
  process.stderr.write(
    `Blocked: "implementer" must run on Haiku; passing model "${tool.model}" overrides its frontmatter. ` +
      `Omit "model" (or pass "haiku"). If the step really needs more, dispatch "implementer-hard" or ` +
      `"implementer-complex" instead, and say why in one line.\n`,
  );
  process.exit(2);
}

if (IMPLEMENTERS.includes(type) && type !== "implementer" && model && !model.includes(TIER[type])) {
  process.stderr.write(
    `Blocked: model "${tool.model}" does not match the tier of "${type}"; omit "model" so its frontmatter applies. ` +
      `Pick a different implementer to change tier.\n`,
  );
  process.exit(2);
}

process.exit(0);
