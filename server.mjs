import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// Resolve __dirname equivalent for ESM
const __dirname = import.meta.dirname;

// Locate the dist dir — works from both source (server.mjs) and build output
const DIST_DIR = path.join(__dirname, "dist");

// Import the cfr-refs generator (CJS module)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { generateDiagram } = require("./skill/cfr-refs.js");

/**
 * Creates a new MCP server instance with the cfr-refs tool and UI resource.
 */
export function createServer() {
  const server = new McpServer({
    name: "cfr-refs",
    version: "1.0.0",
  });

  const resourceUri = "ui://cfr-refs/mcp-app.html";

  // ── Tool: generate-diagram ──────────────────────────────────────────────
  //
  // Accepts a full cfr-refs JSON config object and returns the generated
  // self-contained HTML diagram.  When called from an MCP Apps-capable host
  // the UI resource is also rendered inline.

  registerAppTool(
    server,
    "generate-diagram",
    {
      title: "Generate CFR Diagram",
      description:
        "Generate an interactive HTML regulatory diagram from a cfr-refs " +
        "JSON config. Returns a self-contained HTML document with clickable " +
        "CFR reference tooltips. Supports layouts: events, timeline, " +
        "lifecycle, lifecycle-t, flowchart, sequence, state, gantt.",
      inputSchema: z.object({
        config: z
          .record(z.any())
          .describe(
            "The cfr-refs JSON config object (title, borderColor, layout, defined, etc.)"
          ),
        configDir: z
          .string()
          .optional()
          .describe(
            "Directory for resolving relative mermaidFile/logo paths. Defaults to cwd."
          ),
      }),
      _meta: { ui: { resourceUri } },
    },
    async ({ config, configDir }) => {
      try {
        const html = generateDiagram(config, configDir || process.cwd());
        return {
          content: [{ type: "text", text: html }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ── UI Resource ─────────────────────────────────────────────────────────
  //
  // Returns the bundled MCP App View HTML that renders diagrams inline
  // in the conversation.

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8"
      );
      return {
        contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    }
  );

  return server;
}
