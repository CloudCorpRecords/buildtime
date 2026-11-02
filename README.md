# buildtime

Your builds keep getting slower, but which step is to blame?
buildtime profiles a set of CI runs — per-step durations and,
where known, cache hits — and answers with the numbers that
point at the bottleneck:

- **Per-step statistics** — for every distinct step name:
  how many runs contained it, its total, average, and maximum
  duration, and its share of the grand total, sorted slowest
  first (ties by name)
- **Slowest step** — the first entry in that ranking
- **Trend** — the runs, in the order supplied, split into a
  first half and a second half (the middle run of an odd count
  belongs to the first half), with each half's average run
  total and the percentage delta between them; `null` with
  fewer than two runs, and the delta itself is `null` when the
  first half averages zero
- **Cache correlation** — a run counts as "with cache" when at
  least one of its steps reports a cache hit; buildtime
  reports both group sizes and each group's average run total
  (`null` for an empty group, never zero-filled)
- **Flagged slowest** — when you pass a slow threshold, the
  steps whose average duration meets or exceeds it, in
  slowest-first order

All floats are rounded to four decimal places. The
computation is pure and local: no network, no configuration,
no files read beyond the runs you pass in. Invalid input —
a missing run, a step without a duration, a negative
duration — is rejected with an error naming the offending
path, and no partial profile is produced.

## CLI

```bash
npx @reneturcios/buildtime analyze --runs runs.json
npx @reneturcios/buildtime --version
```

`runs.json` contains the full arguments object:

```json
{
  "runs": [
    {
      "run_id": "run-101",
      "conclusion": "success",
      "steps": [
        { "name": "compile", "duration_seconds": 42.5, "cache_hit": true },
        { "name": "test", "duration_seconds": 87 }
      ]
    }
  ],
  "slow_threshold_seconds": 60
}
```

`conclusion` and `cache_hit` are optional per run / per step,
and `slow_threshold_seconds` is optional overall. The profile
is printed as JSON.

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid runs file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/buildtime mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "buildtime": {
      "command": "npx",
      "args": ["-y", "@reneturcios/buildtime", "mcp"]
    }
  }
}
```

### Tools

- `analyze_build_times` — Profile build bottlenecks across
  CI runs.
  - `runs` (array, required, at least one) — runs as
    `{run_id, conclusion?, steps}` objects, where each step
    is `{name, duration_seconds, cache_hit?}`
  - `slow_threshold_seconds` (number, optional, >= 0) —
    flag steps whose average duration meets this threshold

  Returns `{run_count, grand_total_seconds, step_stats,
  slowest_step, trend, cache, flagged_slowest}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/buildtime
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/buildtime analyze --runs /w/runs.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
