# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `analyze_build_times` MCP tool and
  `analyze` CLI command profiling build bottlenecks across
  CI runs.
- Per-step totals, averages, maxima, and share of total;
  slowest step; first-half vs second-half trend; cache
  correlation; slow-threshold flagging — all floats rounded
  to 4 decimal places, with path-naming validation errors.
