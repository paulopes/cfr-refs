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
const SKILL_PATH = path.join(__dirname, "skill", "cfr-refs-SKILL.md");

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
  const skillGuideUri = "docs://cfr-refs/skill-guide";

  // ── Tool: generate-cfr-refs-diagram ──────────────────────────────────────────────
  //
  // Accepts a full cfr-refs JSON config object and returns the generated
  // self-contained HTML diagram.  When called from an MCP Apps-capable host
  // the UI resource is also rendered inline.

  registerAppTool(
    server,
    "generate-cfr-refs-diagram",
    {
      title: "Generate CFR Diagram",
      description:
        "Generate an interactive HTML regulatory diagram from a cfr-refs JSON config. " +
        "Returns a self-contained HTML document with clickable CFR reference tooltips.\n\n" +
        "IMPORTANT: Before calling this tool, call read-cfr-refs-skill-guide (or read " +
        "the resource docs://cfr-refs/skill-guide) for full JSON schema details, " +
        "layout selection guidance, quality checklists, and examples.\n\n" +
        "Layouts (set via \"layout\" field):\n" +
        "- events: Vertical spine with era sections and clickable event dots (needs \"sections\")\n" +
        "- timeline: Gantt-style bars on a shared year axis (needs \"periods\")\n" +
        "- lifecycle: SVG swim-lane grid — lanes as rows, stages as columns (needs \"lanes\", \"stages\")\n" +
        "- lifecycle-t: Transposed swim-lane grid — lanes as columns, stages as rows (needs \"lanes\", \"stages\")\n" +
        "- flowchart: Mermaid flowchart TD with clickable nodes (needs \"nodeMap\" + \"mermaid\")\n" +
        "- sequence: Mermaid sequenceDiagram with phase cards (needs \"phases\" + \"mermaid\")\n" +
        "- state: Mermaid stateDiagram-v2 with clickable states (needs \"stateMap\" + \"mermaid\")\n" +
        "- gantt: Mermaid gantt chart with clickable tasks (needs \"taskMap\" + \"mermaid\")\n\n" +
        "Required fields (all layouts): title, borderColor, layout, defined.\n" +
        "The \"defined\" object maps CFR section keys to [shortTitle, quotedText] arrays.",
      inputSchema: z.object({
        config: z
          .record(z.any())
          .describe(
            "The cfr-refs JSON config object. Required fields: title (string), " +
            "borderColor (hex string), layout (string), defined (object mapping CFR " +
            "section keys to [shortTitle, quotedText] arrays). Additional fields " +
            "depend on layout — see the skill guide resource for full schema."
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

  // ── Tool: read-skill-guide ──────────────────────────────────────────────
  //
  // Returns the full cfr-refs SKILL.md as text so that clients which don't
  // support MCP resources can still fetch the schema documentation.

  server.tool(
    "read-cfr-refs-skill-guide",
    "Return the full cfr-refs skill guide (JSON schemas for all 8 layouts, " +
      "field references, canonical program colors, quality checklists, and " +
      "worked examples). Call this before generate-cfr-refs-diagram to learn " +
      "how to structure the config object.",
    {},
    async () => {
      const text = await fs.readFile(SKILL_PATH, "utf-8");
      return { content: [{ type: "text", text }] };
    }
  );

  // ── Resource: skill guide ────────────────────────────────────────────────
  //
  // Exposes the cfr-refs SKILL.md as a readable MCP resource so that AI
  // clients can fetch full layout schemas, examples, and quality checklists
  // before calling generate-cfr-refs-diagram.

  server.resource(
    "skill-guide",
    skillGuideUri,
    {
      title: "cfr-refs Skill Guide",
      description:
        "Complete documentation for the cfr-refs diagram generator: " +
        "JSON schemas for all 8 layouts, field references, canonical " +
        "program colors, quality checklists, and worked examples. " +
        "Read this before calling generate-cfr-refs-diagram.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const text = await fs.readFile(SKILL_PATH, "utf-8");
      return {
        contents: [{ uri: uri.toString(), mimeType: "text/markdown", text }],
      };
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
