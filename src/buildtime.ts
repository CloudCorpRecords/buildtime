/**
 * buildtime core: build bottleneck profiling across CI runs.
 *
 *   analyzeBuildTimes(runs, slowThresholdSeconds) -> profile
 *
 * Behaviour:
 * - Each run's total is the sum of its step durations; the grand
 *   total is the sum over every step in every run.
 * - Steps are aggregated by name across all runs. Averages divide
 *   a step's total by the number of runs that contain it (a name
 *   repeated inside one run counts once toward runs_present, but
 *   all of its durations count toward the total and the maximum).
 * - step_stats are sorted by total_seconds descending, ties by
 *   name ascending; slowest_step is the first entry's name.
 * - trend splits the runs, in input order, into a first and a
 *   second half; for an odd run count the middle run belongs to
 *   the first half. delta_percent is null when the first half
 *   averages zero, and the whole trend is null below 2 runs.
 * - A run "has cache" when at least one of its steps has
 *   cache_hit === true. Averages for an empty cache group are
 *   null, never zero-filled.
 * - flagged_slowest lists, in step_stats order, the step names
 *   whose (rounded) avg_seconds meets the slow threshold; it is
 *   empty when no threshold was supplied.
 * - Every float in the result is rounded to 4 decimal places.
 *
 * Validation is strict and path-naming: any malformed input
 * throws an Error naming the offending path (for example
 * "runs[1].steps[0].duration_seconds is required") and no
 * partial result is produced.
 */
import type {
  BuildRun,
  BuildStep,
  BuildTimeResult,
  CacheSummary,
  StepStats,
} from "./types.js";

export const VERSION = "0.1.0";

function round4(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStep(raw: unknown, path: string): BuildStep {
  if (!isRecord(raw)) throw new Error(`${path} must be an object`);
  if (raw.name === undefined) throw new Error(`${path}.name is required`);
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new Error(`${path}.name must be a non-empty string`);
  }
  if (raw.duration_seconds === undefined) {
    throw new Error(`${path}.duration_seconds is required`);
  }
  if (
    typeof raw.duration_seconds !== "number" ||
    !Number.isFinite(raw.duration_seconds)
  ) {
    throw new Error(`${path}.duration_seconds must be a number`);
  }
  if (raw.duration_seconds < 0) {
    throw new Error(`${path}.duration_seconds must be >= 0`);
  }
  if (raw.cache_hit !== undefined && typeof raw.cache_hit !== "boolean") {
    throw new Error(`${path}.cache_hit must be a boolean`);
  }
  const step: BuildStep = {
    name: raw.name,
    duration_seconds: raw.duration_seconds,
  };
  if (raw.cache_hit !== undefined) step.cache_hit = raw.cache_hit;
  return step;
}

function validateRun(raw: unknown, index: number): BuildRun {
  const path = `runs[${index}]`;
  if (!isRecord(raw)) throw new Error(`${path} must be an object`);
  if (raw.run_id === undefined) throw new Error(`${path}.run_id is required`);
  if (typeof raw.run_id !== "string" || raw.run_id.length === 0) {
    throw new Error(`${path}.run_id must be a non-empty string`);
  }
  if (raw.conclusion !== undefined && typeof raw.conclusion !== "string") {
    throw new Error(`${path}.conclusion must be a string`);
  }
  if (raw.steps === undefined) throw new Error(`${path}.steps is required`);
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    throw new Error(`${path}.steps must be a non-empty array`);
  }
  const run: BuildRun = {
    run_id: raw.run_id,
    steps: raw.steps.map((s, j) => validateStep(s, `${path}.steps[${j}]`)),
  };
  if (raw.conclusion !== undefined) run.conclusion = raw.conclusion;
  return run;
}

function validateArgs(
  runs: unknown,
  slowThresholdSeconds: unknown,
): { runs: BuildRun[]; threshold: number | undefined } {
  if (runs === undefined) throw new Error("runs is required");
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error("runs must be a non-empty array");
  }
  const validated = runs.map((r, i) => validateRun(r, i));
  let threshold: number | undefined;
  if (slowThresholdSeconds !== undefined) {
    if (
      typeof slowThresholdSeconds !== "number" ||
      !Number.isFinite(slowThresholdSeconds)
    ) {
      throw new Error("slow_threshold_seconds must be a number");
    }
    if (slowThresholdSeconds < 0) {
      throw new Error("slow_threshold_seconds must be >= 0");
    }
    threshold = slowThresholdSeconds;
  }
  return { runs: validated, threshold };
}

/** Profile build bottlenecks across the supplied runs. */
export function analyzeBuildTimes(
  runs: unknown,
  slowThresholdSeconds?: unknown,
): BuildTimeResult {
  const { runs: validRuns, threshold } = validateArgs(runs, slowThresholdSeconds);

  const runTotals = validRuns.map((run) =>
    run.steps.reduce((sum, s) => sum + s.duration_seconds, 0),
  );
  const grandTotal = runTotals.reduce((sum, t) => sum + t, 0);

  // Per-step aggregation by name.
  interface Acc {
    runsPresent: number;
    total: number;
    max: number;
  }
  const byName = new Map<string, Acc>();
  for (const run of validRuns) {
    const seenInRun = new Set<string>();
    for (const step of run.steps) {
      let acc = byName.get(step.name);
      if (!acc) {
        acc = { runsPresent: 0, total: 0, max: 0 };
        byName.set(step.name, acc);
      }
      acc.total += step.duration_seconds;
      if (step.duration_seconds > acc.max) acc.max = step.duration_seconds;
      if (!seenInRun.has(step.name)) {
        acc.runsPresent += 1;
        seenInRun.add(step.name);
      }
    }
  }

  const stepStats: StepStats[] = [...byName.entries()]
    .map(([name, acc]) => ({
      name,
      runs_present: acc.runsPresent,
      avg_seconds: round4(acc.total / acc.runsPresent),
      max_seconds: round4(acc.max),
      total_seconds: round4(acc.total),
      share_of_total: grandTotal === 0 ? 0 : round4(acc.total / grandTotal),
    }))
    .sort(
      (a, b) =>
        b.total_seconds - a.total_seconds ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );

  // Trend: first half / second half of the runs in input order.
  let trend: BuildTimeResult["trend"] = null;
  if (validRuns.length >= 2) {
    const split = Math.ceil(validRuns.length / 2);
    const first = runTotals.slice(0, split);
    const second = runTotals.slice(split);
    const firstAvg = first.reduce((s, t) => s + t, 0) / first.length;
    const secondAvg = second.reduce((s, t) => s + t, 0) / second.length;
    trend = {
      first_half_avg_total: round4(firstAvg),
      second_half_avg_total: round4(secondAvg),
      delta_percent:
        firstAvg === 0 ? null : round4((100 * (secondAvg - firstAvg)) / firstAvg),
    };
  }

  // Cache correlation.
  let withCount = 0;
  let withSum = 0;
  let withoutSum = 0;
  validRuns.forEach((run, i) => {
    if (run.steps.some((s) => s.cache_hit === true)) {
      withCount += 1;
      withSum += runTotals[i];
    } else {
      withoutSum += runTotals[i];
    }
  });
  const withoutCount = validRuns.length - withCount;
  const cache: CacheSummary = {
    runs_with_cache: withCount,
    runs_without_cache: withoutCount,
    avg_total_with_cache: withCount === 0 ? null : round4(withSum / withCount),
    avg_total_without_cache:
      withoutCount === 0 ? null : round4(withoutSum / withoutCount),
  };

  const flaggedSlowest =
    threshold === undefined
      ? []
      : stepStats.filter((s) => s.avg_seconds >= threshold).map((s) => s.name);

  return {
    run_count: validRuns.length,
    grand_total_seconds: round4(grandTotal),
    step_stats: stepStats,
    slowest_step: stepStats.length === 0 ? null : stepStats[0].name,
    trend,
    cache,
    flagged_slowest: flaggedSlowest,
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
