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
const SERVER_PATH = MAIN_MJS;

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
  "local": {
    label: "Local (.mcp.json in current directory)",
    configPath: () => path.join(process.cwd(), ".mcp.json"),
    serversKey: "mcpServers",
    scope: "project",
  },
  "claude-code": {
    label: "Claude Code",
    configPath: () => path.join(home(), ".claude", ".mcp.json"),
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
  "antigravity": {
    label: "Google Antigravity",
    configPath: () => path.join(home(), ".gemini", "antigravity", "mcp_config.json"),
    serversKey: "mcpServers",
    scope: "global",
  },
  "gemini-cli": {
    label: "Gemini CLI (project)",
    configPath: () => path.join(process.cwd(), ".gemini", "settings.json"),
    serversKey: "mcpServers",
    scope: "project",
  },
  "gemini-cli-global": {
    label: "Gemini CLI (global)",
    configPath: () => path.join(home(), ".gemini", "settings.json"),
    serversKey: "mcpServers",
    scope: "global",
  },
};

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let clientName = "local"; // default

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
    --client=NAME   Target client (default: local)
    --list, -l      List supported clients
    --help, -h      Show this help

  Examples:
    npm run install-mcp
    npm run install-mcp -- --client=claude-code
    node install-mcp.js --client=claude-desktop
`);
}

function printClients() {
  console.log("\n  Supported clients:\n");
  for (const [key, c] of Object.entries(CLIENTS)) {
    const def = key === "local" ? " (default)" : "";
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

// ── Enable server in Claude Code settings ────────────────────────────────────

function enableInClaudeSettings() {
  const settingsPath = path.join(home(), ".claude", "settings.json");
  const MIN_MCP_TOKENS = 75000;

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      warn("settings.json exists but is invalid JSON — skipping Claude Code settings");
      return;
    }
  }

  let dirty = false;

  // enabledMcpjsonServers
  const arr = settings.enabledMcpjsonServers || [];
  if (arr.includes("cfr-refs")) {
    ok("enabledMcpjsonServers already includes cfr-refs");
  } else {
    arr.push("cfr-refs");
    settings.enabledMcpjsonServers = arr;
    dirty = true;
    ok("enabledMcpjsonServers updated");
  }

  // env.MAX_MCP_OUTPUT_TOKENS — diagrams can exceed the 25 000 default
  if (!settings.env) settings.env = {};
  const current = parseInt(settings.env.MAX_MCP_OUTPUT_TOKENS, 10) || 0;
  if (current >= MIN_MCP_TOKENS) {
    ok(`MAX_MCP_OUTPUT_TOKENS already ${current}`);
  } else {
    settings.env.MAX_MCP_OUTPUT_TOKENS = String(MIN_MCP_TOKENS);
    dirty = true;
    ok(`MAX_MCP_OUTPUT_TOKENS set to ${MIN_MCP_TOKENS}`);
  }

  if (dirty) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
    ok(`Settings written → ${settingsPath}`);
  }
}

// ── Enable server in Gemini CLI settings ─────────────────────────────────────

function enableInGeminiSettings(profile) {
  const cfgPath = profile.configPath();

  let settings = {};
  if (fs.existsSync(cfgPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    } catch {
      warn("settings.json exists but is invalid JSON — skipping mcp.allowed update");
      return;
    }
  }

  if (!settings.mcp) settings.mcp = {};
  const allowed = settings.mcp.allowed || [];
  if (allowed.includes("cfr-refs")) {
    ok("mcp.allowed already includes cfr-refs");
    return;
  }

  allowed.push("cfr-refs");
  settings.mcp.allowed = allowed;
  fs.writeFileSync(cfgPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  ok(`mcp.allowed updated → ${cfgPath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const clientName = parseArgs();
const profile = CLIENTS[clientName];

console.log(`\n  cfr-refs MCP Installer  →  ${profile.label}\n`);

try {
  checkPrerequisites();
  registerServer(profile);

  if (clientName === "claude-code") {
    enableInClaudeSettings();
  }

  if (clientName === "gemini-cli" || clientName === "gemini-cli-global") {
    enableInGeminiSettings(profile);
  }

  console.log(`\n\x1b[32mDone!\x1b[0m cfr-refs is ready to use with ${profile.label}.\n`);
  console.log("  Stdio mode:  node " + SERVER_PATH + " --stdio");
  console.log("  HTTP mode:   node " + SERVER_PATH + "  (port 3001)");
  console.log("\n  The 'generate-cfr-refs-diagram' tool is now available.");
  if (clientName === "claude-code") {
    console.log("  \x1b[33mIMPORTANT:\x1b[0m Fully quit Claude Code (don't just close the window) and relaunch it.");
  }
  console.log("  Ask your AI assistant: \"What tools do you have?\" to verify.\n");
} catch (e) {
  fail(e.message);
}
