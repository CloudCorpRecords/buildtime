import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeBuildTimes } from "../src/buildtime.js";

/**
 * All tests are pure local computation over inline run
 * histories: no filesystem, no network. Each behaviour in the
 * spec is pinned by its own case, including the null paths.
 */

const run = (id: string, steps: Array<[string, number, boolean?]>, conclusion?: string) => ({
  run_id: id,
  ...(conclusion !== undefined ? { conclusion } : {}),
  steps: steps.map(([name, duration_seconds, cache_hit]) => ({
    name,
    duration_seconds,
    ...(cache_hit !== undefined ? { cache_hit } : {}),
  })),
});

describe("analyzeBuildTimes — step statistics", () => {
  it("aggregates per-step totals, averages, maxima, and shares", () => {
    const out = analyzeBuildTimes([
      run("r1", [["compile", 10], ["test", 30]]),
      run("r2", [["compile", 20], ["test", 10]]),
    ]);
    assert.equal(out.run_count, 2);
    assert.equal(out.grand_total_seconds, 70);
    assert.deepEqual(
      out.step_stats.map((s) => s.name),
      ["test", "compile"],
    );
    const test = out.step_stats[0];
    assert.equal(test.runs_present, 2);
    assert.equal(test.total_seconds, 40);
    assert.equal(test.avg_seconds, 20);
    assert.equal(test.max_seconds, 30);
    assert.equal(test.share_of_total, 0.5714);
    const compile = out.step_stats[1];
    assert.equal(compile.total_seconds, 30);
    assert.equal(compile.avg_seconds, 15);
    assert.equal(compile.share_of_total, 0.4286);
    assert.equal(out.slowest_step, "test");
  });

  it("sorts step_stats by total descending, ties by name ascending", () => {
    const out = analyzeBuildTimes([
      run("r1", [["zebra", 10], ["alpha", 10], ["mid", 5]]),
    ]);
    assert.deepEqual(
      out.step_stats.map((s) => s.name),
      ["alpha", "zebra", "mid"],
    );
    assert.equal(out.slowest_step, "alpha");
  });

  it("rounds floats to 4 decimal places", () => {
    const out = analyzeBuildTimes([
      run("r1", [["a", 1]]),
      run("r2", [["a", 1]]),
      run("r3", [["a", 1], ["b", 1]]),
    ]);
    const a = out.step_stats.find((s) => s.name === "a");
    assert.equal(a?.share_of_total, 0.75);
    const third = analyzeBuildTimes([run("r1", [["x", 1], ["y", 2]])]);
    assert.equal(third.step_stats.find((s) => s.name === "x")?.share_of_total, 0.3333);
    assert.equal(third.step_stats.find((s) => s.name === "y")?.share_of_total, 0.6667);
  });

  it("gives share 0 and slowest by tie-break when the grand total is 0", () => {
    const out = analyzeBuildTimes([run("r1", [["b", 0], ["a", 0]])]);
    assert.equal(out.grand_total_seconds, 0);
    assert.ok(out.step_stats.every((s) => s.share_of_total === 0));
    assert.equal(out.slowest_step, "a");
  });

  it("counts a repeated step name once toward runs_present but sums all durations", () => {
    const out = analyzeBuildTimes([
      run("r1", [["compile", 5], ["compile", 7]]),
      run("r2", [["compile", 8]]),
    ]);
    const compile = out.step_stats[0];
    assert.equal(compile.runs_present, 2);
    assert.equal(compile.total_seconds, 20);
    assert.equal(compile.avg_seconds, 10);
    assert.equal(compile.max_seconds, 8);
  });

  it("carries conclusion without interpreting it", () => {
    const out = analyzeBuildTimes([
      run("r1", [["a", 3]], "failure"),
      run("r2", [["a", 3]], "cancelled"),
    ]);
    assert.equal(out.run_count, 2);
    assert.equal(out.grand_total_seconds, 6);
  });
});

describe("analyzeBuildTimes — trend", () => {
  it("returns trend null for fewer than 2 runs", () => {
    const out = analyzeBuildTimes([run("r1", [["a", 10]])]);
    assert.equal(out.trend, null);
  });

  it("computes first/second half averages and delta percent for an even split", () => {
    const out = analyzeBuildTimes([
      run("r1", [["a", 10]]),
      run("r2", [["a", 20]]),
      run("r3", [["a", 30]]),
      run("r4", [["a", 50]]),
    ]);
    assert.deepEqual(out.trend, {
      first_half_avg_total: 15,
      second_half_avg_total: 40,
      delta_percent: 166.6667,
    });
  });

  it("puts the middle run in the first half for an odd count", () => {
    const out = analyzeBuildTimes([
      run("r1", [["a", 10]]),
      run("r2", [["a", 20]]),
      run("r3", [["a", 60]]),
    ]);
    // First half = r1, r2 (avg 15); second half = r3 (60).
    assert.deepEqual(out.trend, {
      first_half_avg_total: 15,
      second_half_avg_total: 60,
      delta_percent: 300,
    });
  });

  it("returns delta_percent null when the first half averages 0", () => {
    const out = analyzeBuildTimes([
      run("r1", [["a", 0]]),
      run("r2", [["a", 10]]),
    ]);
    assert.equal(out.trend?.first_half_avg_total, 0);
    assert.equal(out.trend?.second_half_avg_total, 10);
    assert.equal(out.trend?.delta_percent, null);
  });
});

describe("analyzeBuildTimes — cache correlation", () => {
  it("splits runs by whether any step hit the cache", () => {
    const out = analyzeBuildTimes([
      run("r1", [["a", 10, true], ["b", 10, false]]),
      run("r2", [["a", 40, false]]),
      run("r3", [["a", 20]]),
    ]);
    assert.deepEqual(out.cache, {
      runs_with_cache: 1,
      runs_without_cache: 2,
      avg_total_with_cache: 20,
      avg_total_without_cache: 30,
    });
  });

  it("returns avg_total_without_cache null when every run has cache", () => {
    const out = analyzeBuildTimes([
      run("r1", [["a", 10, true]]),
      run("r2", [["a", 30, true]]),
    ]);
    assert.equal(out.cache.runs_without_cache, 0);
    assert.equal(out.cache.avg_total_with_cache, 20);
    assert.equal(out.cache.avg_total_without_cache, null);
  });

  it("returns avg_total_with_cache null when no run has cache", () => {
    const out = analyzeBuildTimes([
      run("r1", [["a", 10, false]]),
      run("r2", [["a", 30]]),
    ]);
    assert.equal(out.cache.runs_with_cache, 0);
    assert.equal(out.cache.avg_total_with_cache, null);
    assert.equal(out.cache.avg_total_without_cache, 20);
  });
});

describe("analyzeBuildTimes — flagged_slowest", () => {
  it("is empty when the threshold argument is absent", () => {
    const out = analyzeBuildTimes([run("r1", [["a", 100]])]);
    assert.deepEqual(out.flagged_slowest, []);
  });

  it("flags steps whose average meets the threshold, in step_stats order", () => {
    const out = analyzeBuildTimes(
      [
        run("r1", [["slow", 50], ["edge", 20], ["fast", 5]]),
        run("r2", [["slow", 30], ["edge", 20], ["fast", 5]]),
      ],
      20,
    );
    // avg: slow 40, edge 20 (boundary, >=), fast 5.
    assert.deepEqual(out.flagged_slowest, ["slow", "edge"]);
  });
});

describe("analyzeBuildTimes — validation", () => {
  it("rejects missing or empty runs", () => {
    assert.throws(() => analyzeBuildTimes(undefined), /runs is required/);
    assert.throws(() => analyzeBuildTimes([]), /runs must be a non-empty array/);
    assert.throws(() => analyzeBuildTimes("nope"), /runs must be a non-empty array/);
  });

  it("rejects a run missing run_id or steps, naming the path", () => {
    assert.throws(
      () => analyzeBuildTimes([{ steps: [{ name: "a", duration_seconds: 1 }] }]),
      /runs\[0\]\.run_id is required/,
    );
    assert.throws(
      () => analyzeBuildTimes([run("r1", [["a", 1]]), { run_id: "r2" }]),
      /runs\[1\]\.steps is required/,
    );
    assert.throws(
      () => analyzeBuildTimes([{ run_id: "r1", steps: [] }]),
      /runs\[0\]\.steps must be a non-empty array/,
    );
  });

  it("rejects a step missing name or duration_seconds, naming the path", () => {
    assert.throws(
      () => analyzeBuildTimes([{ run_id: "r1", steps: [{ duration_seconds: 1 }] }]),
      /runs\[0\]\.steps\[0\]\.name is required/,
    );
    assert.throws(
      () =>
        analyzeBuildTimes([
          run("r1", [["a", 1]]),
          { run_id: "r2", steps: [{ name: "b" }] },
        ]),
      /runs\[1\]\.steps\[0\]\.duration_seconds is required/,
    );
  });

  it("rejects a negative duration and a negative threshold", () => {
    assert.throws(
      () => analyzeBuildTimes([run("r1", [["a", -1]])]),
      /runs\[0\]\.steps\[0\]\.duration_seconds must be >= 0/,
    );
    assert.throws(
      () => analyzeBuildTimes([run("r1", [["a", 1]])], -5),
      /slow_threshold_seconds must be >= 0/,
    );
  });

  it("rejects wrong-typed optional fields, naming the path", () => {
    assert.throws(
      () =>
        analyzeBuildTimes([
          { run_id: "r1", steps: [{ name: "a", duration_seconds: 1, cache_hit: "yes" }] },
        ]),
      /runs\[0\]\.steps\[0\]\.cache_hit must be a boolean/,
    );
    assert.throws(
      () => analyzeBuildTimes([run("r1", [["a", 1]])], "20"),
      /slow_threshold_seconds must be a number/,
    );
  });
});
