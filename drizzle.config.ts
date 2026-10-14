import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_UNPOOLED;

// generate/check read schema files offline and work without a database; only
// connection-backed subcommands need the direct Neon URL. Fail those with a
// clear message instead of drizzle-kit's connection error against "".
const connectionCommands = new Set(["migrate", "up", "studio"]);
const needsConnection = process.argv.some((arg) => connectionCommands.has(arg));
if (needsConnection && !url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is not set: drizzle-kit needs the direct (unpooled) Postgres URL (see .claude/rules/database.md).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: {
    url: url ?? "",
  },
});
