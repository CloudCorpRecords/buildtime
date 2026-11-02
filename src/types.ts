/**
 * buildtime types.
 *
 * buildtime profiles build bottlenecks across a set of CI runs.
 * The caller supplies each run's steps with their durations (and,
 * where known, whether a step hit the cache), and buildtime
 * reports, as pure local computation:
 *
 *   - per-step totals, averages, maxima, and share of the grand
 *     total, sorted slowest first
 *   - the single slowest step
 *   - a first-half vs second-half trend in per-run totals
 *   - a cache correlation summary (runs with at least one cache
 *     hit vs runs with none)
 *   - the steps whose average duration meets a caller-supplied
 *     slow threshold
 *
 * Nothing is fetched, executed, or guessed: the numbers come
 * only from the runs supplied.
 */

/** One step inside one run, as supplied by the caller. */
export interface BuildStep {
  /** Step name; steps sharing a name are aggregated together. */
  name: string;
  /** Step duration in seconds; must be >= 0. */
  duration_seconds: number;
  /** Whether this step hit the cache, when known. */
  cache_hit?: boolean;
}

/** One CI run, as supplied by the caller. */
export interface BuildRun {
  /** Identifier for the run. */
  run_id: string;
  /** Run conclusion (e.g. success / failure); carried, not interpreted. */
  conclusion?: string;
  /** Steps in the run; at least one. */
  steps: BuildStep[];
}

/** Aggregated statistics for one distinct step name. */
export interface StepStats {
  name: string;
  /** Runs containing at least one step with this name. */
  runs_present: number;
  /** Total duration divided by runs_present, rounded to 4 dp. */
  avg_seconds: number;
  /** Largest single step duration with this name, rounded to 4 dp. */
  max_seconds: number;
  /** Sum of durations for this name, rounded to 4 dp. */
  total_seconds: number;
  /** total_seconds / grand total (0 when the grand total is 0), rounded to 4 dp. */
  share_of_total: number;
}

/** First-half vs second-half trend in per-run totals. */
export interface BuildTrend {
  first_half_avg_total: number;
  second_half_avg_total: number;
  /** 100 * (second - first) / first; null when the first half averages 0. */
  delta_percent: number | null;
}

/** Cache correlation summary across runs. */
export interface CacheSummary {
  /** Runs where at least one step has cache_hit === true. */
  runs_with_cache: number;
  runs_without_cache: number;
  /** Average per-run total for runs with cache; null when there are none. */
  avg_total_with_cache: number | null;
  /** Average per-run total for runs without cache; null when there are none. */
  avg_total_without_cache: number | null;
}

/** The bottleneck profile. */
export interface BuildTimeResult {
  run_count: number;
  grand_total_seconds: number;
  step_stats: StepStats[];
  /** Name of the slowest step (first step_stats entry); null when none. */
  slowest_step: string | null;
  /** Null when fewer than 2 runs were supplied. */
  trend: BuildTrend | null;
  cache: CacheSummary;
  /** Step names whose avg_seconds >= the slow threshold, in step_stats order; [] when no threshold was given. */
  flagged_slowest: string[];
}
