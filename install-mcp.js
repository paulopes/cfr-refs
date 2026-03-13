#!/usr/bin/env node
/**
 * install-mcp.js — Cross-platform installer for cfr-refs MCP server
 *
 * Prerequisite: run `npm install` and `npm run build` first.
 *
 * Automates:
 *   1. Registers the MCP server in the target client's config
 *
 * Usage:
 *   npm run install-mcp                     # defaults to claude-code
 *   npm run install-mcp -- --client=vscode
 *   npm run install-mcp -- --list           # show supported clients
 *
 *   node install-mcp.js                     # same, called directly
 *   node install-mcp.js --client=cursor
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = __dirname;
const MAIN_MJS = path.join(ROOT, "main.mjs");
const SERVER_PATH = MAIN_MJS.replace(/\\/g, "/");

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`\x1b[36m→\x1b[0m ${msg}`); }
function ok(msg)   { console.log(`\x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg) { console.log(`\x1b[33m!\x1b[0m ${msg}`); }
function fail(msg) { console.error(`\x1b[31m✗\x1b[0m ${msg}`); process.exit(1); }

function home() {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

function appData() {
  if (process.platform === "win32") return process.env.APPDATA || path.join(home(), "AppData", "Roaming");
  if (process.platform === "darwin") return path.join(home(), "Library", "Application Support");
  return process.env.XDG_CONFIG_HOME || path.join(home(), ".config");
}

// ── Client profiles ─────────────────────────────────────────────────────────
//
// Each profile defines:
//   label       — human-readable name
//   configPath  — absolute path to the JSON config file
//   serversKey  — top-level key in that JSON ("mcpServers" or "servers")
//   scope       — "project" (relative to ROOT) or "global"
const CLIENTS = {
  "claude-code": {
    label: "Claude Code",
    configPath: () => path.join(home(), ".claude", "settings.json"),
    serversKey: "mcpServers",
    scope: "global",
  },
  "claude-desktop": {
    label: "Claude Desktop",
    configPath: () => path.join(appData(), "Claude", "claude_desktop_config.json"),
    serversKey: "mcpServers",
    scope: "global",
  },
  "vscode": {
    label: "VS Code (GitHub Copilot)",
    configPath: () => path.join(ROOT, ".vscode", "mcp.json"),
    serversKey: "servers",
    scope: "project",
  },
  "cursor": {
    label: "Cursor",
    configPath: () => path.join(home(), ".cursor", "mcp.json"),
    serversKey: "mcpServers",
    scope: "global",
  },
  "windsurf": {
    label: "Windsurf",
    configPath: () => path.join(home(), ".codeium", "windsurf", "mcp_config.json"),
    serversKey: "mcpServers",
    scope: "global",
  },
};

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let clientName = "claude-code"; // default

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") { printUsage(); process.exit(0); }
    if (arg === "--list" || arg === "-l") { printClients(); process.exit(0); }
    if (arg.startsWith("--client="))     { clientName = arg.slice("--client=".length); }
    else if (arg.startsWith("--client")) { fail("Use --client=NAME (e.g. --client=vscode)"); }
  }

  if (!CLIENTS[clientName]) {
    fail(`Unknown client "${clientName}". Use --list to see supported clients.`);
  }
  return clientName;
}

function printUsage() {
  console.log(`
  Usage: npm run install-mcp [-- options]
         node install-mcp.js [options]

  Prerequisites: npm install && npm run build

  Options:
    --client=NAME   Target client (default: claude-code)
    --list, -l      List supported clients
    --help, -h      Show this help

  Examples:
    npm run install-mcp
    npm run install-mcp -- --client=vscode
    node install-mcp.js --client=claude-desktop
`);
}

function printClients() {
  console.log("\n  Supported clients:\n");
  for (const [key, c] of Object.entries(CLIENTS)) {
    const def = key === "claude-code" ? " (default)" : "";
    console.log(`    ${key.padEnd(18)} ${c.label}${def}`);
    console.log(`${"".padEnd(22)} config: ${c.configPath()}  [${c.scope}]`);
  }
  console.log();
}

// ── Pre-flight checks ────────────────────────────────────────────────────────

function checkPrerequisites() {
  const nm = path.join(ROOT, "node_modules");
  if (!fs.existsSync(nm)) {
    fail("node_modules not found. Run 'npm install' first.");
  }
  ok("node_modules present");

  const dist = path.join(ROOT, "dist", "mcp-app.html");
  if (!fs.existsSync(dist)) {
    fail("dist/mcp-app.html not found. Run 'npm run build' first.");
  }
  ok("dist/mcp-app.html present");
}

// ── Register MCP server ─────────────────────────────────────────────────────

function registerServer(profile) {
  const cfgPath = profile.configPath();
  const key = profile.serversKey;

  const entry = {
    command: "node",
    args: [SERVER_PATH, "--stdio"],
  };

  // Ensure parent directory exists (e.g. .vscode/)
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });

  let existing = {};
  if (fs.existsSync(cfgPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    } catch {
      warn(path.basename(cfgPath) + " exists but is invalid JSON — will overwrite");
    }
  }

  if (!existing[key]) existing[key] = {};

  if (existing[key]["cfr-refs"]) {
    const cur = existing[key]["cfr-refs"];
    if (cur.command === entry.command &&
        JSON.stringify(cur.args) === JSON.stringify(entry.args)) {
      ok("Config already has cfr-refs registered — no changes needed");
      return;
    }
    warn("Config has a different cfr-refs entry — updating");
  }

  existing[key]["cfr-refs"] = entry;
  fs.writeFileSync(cfgPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  ok(`MCP config written → ${cfgPath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const clientName = parseArgs();
const profile = CLIENTS[clientName];

console.log(`\n  cfr-refs MCP Installer  →  ${profile.label}\n`);

try {
  checkPrerequisites();
  registerServer(profile);

  console.log(`\n\x1b[32mDone!\x1b[0m cfr-refs is ready to use with ${profile.label}.\n`);
  console.log("  Stdio mode:  node " + SERVER_PATH + " --stdio");
  console.log("  HTTP mode:   node " + SERVER_PATH + "  (port 3001)");
  console.log("\n  The 'generate-diagram' tool is now available.");
  console.log("  Ask your AI assistant: \"What tools do you have?\" to verify.\n");
} catch (e) {
  fail(e.message);
}
