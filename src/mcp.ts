/**
 * buildtime MCP server. Tools: analyze_build_times.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The profiling is pure local computation: no upstream API,
 * no authentication, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { analyzeBuildTimes, formatPayload, VERSION } from "./buildtime.js";

const TOOLS = [
  {
    name: "analyze_build_times",
    description:
      "Profile build bottlenecks across CI runs: per-step totals, averages, and share of total time, the slowest step, a first-half vs second-half trend in run totals, cache correlation, and steps flagged by a slow threshold.",
    inputSchema: {
      type: "object" as const,
      properties: {
        runs: {
          type: "array",
          description: "CI runs to profile (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              run_id: { type: "string", description: "Identifier for the run" },
              conclusion: {
                type: "string",
                description:
                  "Run conclusion, e.g. success or failure (optional; carried, not interpreted)",
              },
              steps: {
                type: "array",
                description: "Steps in the run (at least one)",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Step name" },
                    duration_seconds: {
                      type: "number",
                      description: "Step duration in seconds",
                      minimum: 0,
                    },
                    cache_hit: {
                      type: "boolean",
                      description: "Whether the step hit the cache (optional)",
                    },
                  },
                  required: ["name", "duration_seconds"],
                },
              },
            },
            required: ["run_id", "steps"],
          },
        },
        slow_threshold_seconds: {
          type: "number",
          description:
            "Average-duration threshold in seconds for flagging slow steps (optional)",
          minimum: 0,
        },
      },
      required: ["runs"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "buildtime", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "analyze_build_times") {
      const raw = (args ?? {}) as Record<string, unknown>;
      out = analyzeBuildTimes(raw.runs, raw.slow_threshold_seconds);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
