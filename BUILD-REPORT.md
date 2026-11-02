# buildtime — Build Report

MCP Rebuild 1000, Batch 12. Original program build from the
packages-100 plan (cluster B #15), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch12/buildtime.md` (read
first). There is no external original; the tool surface is the
program's defined spec. Local build only — nothing pushed or
published.

Identity: repo `buildtime`, npm `@reneturcios/buildtime`,
MCP name `io.github.CloudCorpRecords/buildtime`, version
`0.1.0`, bin `buildtime` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Build
  bottleneck profiler: slowest steps, run trend, and cache
  correlation across CI runs.", 90 chars ≤100; npm entry
  carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/buildtime:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/buildtime"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`analyze --runs <runs.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/buildtime.ts` (core,
  `VERSION = "0.1.0"`)
- `test/buildtime.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/buildtime`)

## Tools implemented (1)

- `analyze_build_times` — arguments: `runs` (array, required,
  minItems 1) of `{run_id (string, required), conclusion
  (string, optional; carried, not interpreted), steps (array,
  required, minItems 1) of {name (string, required),
  duration_seconds (number, required, minimum 0), cache_hit
  (boolean, optional)}}`, plus `slow_threshold_seconds`
  (number, optional, minimum 0).

  Returns `{run_count, grand_total_seconds, step_stats,
  slowest_step, trend, cache, flagged_slowest}`: per-run
  totals summed from step durations; per-step `runs_present`,
  `avg_seconds`, `max_seconds`, `total_seconds`, and
  `share_of_total` (0 when the grand total is 0), sorted by
  total descending with name-ascending ties; `trend` null
  below 2 runs, otherwise first-half / second-half average
  run totals (odd counts put the middle run in the first
  half) with `delta_percent` null when the first half
  averages 0; `cache` counts a run as with-cache when any
  step has `cache_hit === true`, with null averages for an
  empty group; `flagged_slowest` lists steps whose average
  meets the threshold in step_stats order, `[]` when the
  threshold is absent. All floats are rounded to 4 decimal
  places.

  The fixture literal
  (`harness/fixtures/buildtime-tools-original.json`) and the
  `src/mcp.ts` literal are identical, with no `$schema` and
  no `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the fixture,
  per the standing fleet rule (no McpServer/zod schema
  conversion). Every `tools/call` is validated by the core
  itself, so the MCP and CLI paths share one validation
  implementation.
- Validation is path-naming and total: missing/empty
  `runs`, a run missing `run_id`/`steps`, an empty `steps`
  array, a step missing `name`/`duration_seconds`, a
  negative duration, a negative threshold, or a wrongly
  typed optional field throws an Error naming the
  offending path (e.g. `runs[1].steps[0].duration_seconds
  is required`) and produces no partial result (MCP:
  `isError`; CLI: exit 1).
- Local choices where the spec is silent (see also
  "Gaps"): a step name repeated inside one run counts once
  toward `runs_present` while all its durations count
  toward the total and maximum, so `avg_seconds` is the
  total divided by runs present; `flagged_slowest`
  compares the rounded `avg_seconds` against the
  threshold.

## Verification (foreground, this session)

- `npx tsc` exit 0 (`dist/cli.js` built)
- `npm test` (`tsx --test test/*.test.ts`): **20 tests,
  20 pass, 0 fail** — per-step aggregation and shares,
  sort order with name tie-break, 4-dp rounding, zero
  grand total shares, repeated step names in one run,
  conclusion carried uninterpreted, trend null below 2
  runs, even and odd (middle-to-first-half) splits,
  delta null when the first half averages 0, cache split
  with both null-average directions, flagged_slowest
  absent-threshold and boundary (>=) behaviour, and the
  validation/error paths (missing/empty runs, missing
  run_id/steps naming the path, missing step
  name/duration naming the path, negative duration and
  threshold, wrong-typed cache_hit and threshold)
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `analyze` with no `--runs` exits 2;
  `analyze --runs <missing file>` exits 1 naming the file;
  `analyze --runs <valid file>` exits 0 and prints the
  profile JSON (verified: grand total 70, slowest `test`,
  trend delta -25, cache 1/1 split, both steps flagged at
  threshold 15)
- Parity: `harness/parity.py` vs
  `harness/fixtures/buildtime-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1**

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
without `node_modules`/`dist`/`package-lock.json`, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/buildtime`, **128 package entries**. Local
`node_modules` was installed via `npm install
--ignore-scripts --offline` for build/test; gitignored.

## Gaps / honest notes

- **avg_seconds denominator:** the spec defines
  `runs_present` as "runs containing it" and lists
  `avg_seconds` without naming a denominator. The natural
  reading — total divided by runs present — is implemented;
  for the usual one-occurrence-per-run shape this is also
  the per-occurrence average. The repeated-name-in-one-run
  behaviour is pinned by a test so the choice is explicit.
- **flagged comparison:** the threshold is compared
  against the rounded `avg_seconds` that appears in the
  output, keeping the flag list consistent with the
  reported numbers; the spec does not distinguish raw vs
  rounded here.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
