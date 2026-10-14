// Boots the in-process test database (PGlite + TCP socket) for Playwright's
// webServer chain and for manual QA. With --exec it runs a command (e.g.
// `next start`) with DATABASE_URL pointed at the harness and tears the database
// down when that command exits; without --exec it stays up until SIGINT/SIGTERM.
//
// CLI entry, deliberately thin: it runs main() unconditionally (see
// scripts/e2e/build.ts for why there is no "is this the entry script" guard).
import { type ChildProcess, spawn } from "node:child_process";

import { startTestDatabase, TEST_DB_DEFAULT_PORT } from "./harness";

type CliOptions = { port?: number; exec?: string };

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--port needs a value");
      options.port = Number.parseInt(value, 10);
      index += 1;
    } else if (arg?.startsWith("--port=")) {
      options.port = Number.parseInt(arg.slice("--port=".length), 10);
    } else if (arg === "--exec") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error("--exec needs a command");
      options.exec = value;
      index += 1;
    } else if (arg?.startsWith("--exec=")) {
      options.exec = arg.slice("--exec=".length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const db = await startTestDatabase({ port: options.port ?? TEST_DB_DEFAULT_PORT });
  console.log(`[test-db] listening on ${db.host}:${db.port}`);
  console.log(`[test-db] DATABASE_URL=${db.databaseUrl}`);

  let child: ChildProcess | undefined;
  let shuttingDown = false;

  const shutdown = async (code: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (child?.pid !== undefined) {
      try {
        // The child is its own process group, so kill the whole command (pnpm -> next).
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
    await db.stop().catch(() => undefined);
    console.log(`[test-db] stopped; port ${db.port} released`);
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  if (options.exec === undefined) {
    console.log("[test-db] no --exec given; waiting for SIGINT/SIGTERM");
    return;
  }

  console.log(`[test-db] exec: ${options.exec}`);
  child = spawn(options.exec, {
    shell: true,
    stdio: "inherit",
    detached: process.platform !== "win32",
    env: { ...process.env, DATABASE_URL: db.databaseUrl, DATABASE_URL_UNPOOLED: db.databaseUrl },
  });
  child.on("error", (error) => {
    console.error(`[test-db] exec failed: ${String(error)}`);
    void shutdown(1);
  });
  child.on("exit", (code) => {
    void shutdown(code ?? 0);
  });
}

main().catch((error: unknown) => {
  console.error(`[test-db] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
