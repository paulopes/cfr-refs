# cfr-refs — Interactive Regulatory Workflow Diagrams

A skill for Claude.ai Projects that generates interactive HTML diagrams of federal regulatory processes. Each node in the flowchart is clickable, revealing the governing Code of Federal Regulations (CFR) text in a tooltip. Diagrams render client-side using Mermaid via CDN — no external dependencies required.

## What It Does

You describe a regulatory process (the steps, the actors, and the CFR sections that govern each step), and Claude produces a styled, self-contained HTML page with a Mermaid flowchart. Clicking any node shows a popup with paraphrased regulatory text and section references.

## Files

This skill consists of two files:

| File | Purpose |
|------|---------|
| `cfr-refs-SKILL.md` | Skill spec — tells Claude how to structure the data files and run the tool |
| `cfr-refs.js` | Node.js script — reads a `.json` config and `.mmd` flowchart, outputs a styled HTML page |

## Setup

1. Open the Claude.ai project page with the chats where you want to be able to use this skill
2. Upload both `cfr-refs-SKILL.md` and `cfr-refs.js` to the project's sidebar where the project's reference files are listed (if you drag-drop the files you'll see that as you drop the files the landing area is called **Project Knowledge**)

That's it. Claude will recognize CFR/regulatory diagram requests automatically and follow the skill spec. At the start of each conversation that uses the skill, Claude copies `cfr-refs.js` from the uploads into its working environment and runs it with Node.js.

Alternatively, while in a Claude.ai chat, tell it that you want to use the skill that is in the files `cfr-refs-SKILL.md` and `cfr-refs.js`, which you will have directly uploaded to the chat. However, this alternate method only makes the skill available to that chat.

## Usage

Ask Claude to create a regulatory workflow diagram. For example:

> "Create a CFR workflow diagram for the E-Rate program under 47 CFR Part 54 Subpart F."

Claude will:

1. Research the relevant CFR sections (or use content you provide)
2. Create a `.json` config with regulatory references and metadata
3. Create a `.mmd` Mermaid flowchart with styled, labeled nodes
4. Validate that all node IDs and section keys are consistent
5. Run `cfr-refs.js` to generate the HTML
6. Return the interactive HTML file

## How It Works

The skill splits the work into data and rendering:

**Data layer** — Claude creates two files sharing a base name (e.g., `erate.json` and `erate.mmd`). The JSON holds the page title, subtitle, CFR section definitions (short title + description for each section number), and a node map linking flowchart node IDs to their governing sections. The `.mmd` file is a standard Mermaid `flowchart TD` with styled nodes color-coded by role (start, decision, approval, denial, waiting).

**Rendering** — `cfr-refs.js` reads both files and assembles a single self-contained HTML page. Mermaid renders the flowchart client-side via CDN. A small inline script binds click handlers to each node, showing the relevant CFR text in a styled tooltip. No server, no build step, no external dependencies beyond the Mermaid CDN.

## Requirements

- A Claude.ai Project with file creation enabled
- Node.js is available in Claude's container environment by default — no additional setup needed
- The generated HTML files work in any modern browser

## Customization

The JSON config supports optional fields for navigation links between related diagrams (`nav`) and a border accent color (`borderColor`). Node colors follow a fixed palette defined in the skill spec (blue for start/registration, orange for decisions, green for approvals, red for denials, yellow for waiting periods). See `cfr-refs-SKILL.md` for the full schema and color table.