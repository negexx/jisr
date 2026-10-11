import { z } from "zod";

export const GuideFrontmatterSchema = z.object({
  source_url: z.string().regex(/^https:\/\/.+/i, "source_url must be an https URL"),
  info_kind: z.enum(["official", "estimate", "guidance"]),
  last_verified_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date"),
});

export type GuideFrontmatter = z.infer<typeof GuideFrontmatterSchema>;

export function parseGuideFrontmatter(input: unknown): GuideFrontmatter {
  return GuideFrontmatterSchema.parse(input);
}
