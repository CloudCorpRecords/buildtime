#!/usr/bin/env node
/**
 * buildtime CLI.
 *
 *   buildtime analyze --runs <runs.json>
 *   buildtime mcp
 *
 * The runs file contains the full arguments object:
 * {"runs": [...], "slow_threshold_seconds": n} (the threshold
 * is optional). Pure local computation: no network, no
 * configuration. Argument validation happens before any file
 * is read.
 * Exit codes: 0 success, 1 runtime error (including an
 * unreadable or invalid runs file, or invalid input naming
 * the offending path), 2 usage error.
 */
import { readFileSync } from "node:fs";
import { analyzeBuildTimes, formatPayload, VERSION } from "./buildtime.js";

function usage(): never {
  console.error(`Usage:
  buildtime analyze --runs <runs.json>
  buildtime mcp
  buildtime --version`);
  process.exit(2);
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (cmd !== "analyze") usage();

  // ---- Argument validation (before any file is read) ----
  const flags = ["--runs"];
  if (rest.some((a) => a.startsWith("--") && !flags.includes(a))) usage();
  const runsPath = flag(rest, "--runs");
  if (runsPath === undefined) usage();

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(runsPath, "utf8"));
  } catch (err) {
    console.error(
      `error: cannot read or parse runs file '${runsPath}': ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  try {
    const raw =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const out = analyzeBuildTimes(raw.runs, raw.slow_threshold_seconds);
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
