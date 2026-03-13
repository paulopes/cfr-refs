# cfr-refs

Generate styled, interactive HTML diagrams paired with CFR United States regulatory reference data.

Click any node in the rendered diagram to see the relevant cfr-refs (Code of Federal Regulations) text in a tooltip.

## Install

```bash
git clone git@github.com:paulopes/cfr-refs.git && cd cfr-refs
npm install
npm link
```

This makes `cfr-refs` available as a global command.

## Usage

```bash
cfr-refs <config.json> [--output <file.html>]
```
Options:
  - `-o, --output` <file>   Output HTML file (default: derived from config filename)
  - `-h, --help`            Show usage help


    > **Note:** If `--output` (or `-o`) is omitted, the output filename is derived from the config filename (e.g. `contributions.json` → `contributions.html`).

### Example

```bash
cfr-refs contributions.json
```

## Config File

The JSON config defines the diagram type, content, and metadata. Please see the [cfr-refs-SKILL.md](skill/cfr-refs-SKILL.md) file for details.

## Output

A self-contained HTML file with:

- An interactive diagram that is partially rendered client-side
- Clickable nodes that display cfr-refs reference popups and acronym tooltips

## Claude Code Skill

You can install cfr-refs as a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code) so that `/cfr-refs` generates new diagram sets from a description.

Copy the `skill/cfr-refs-SKILL.md` file into your Claude Code skills directory inside a `cfr-refs` subdirectory:

**macOS / Linux:**
```bash
mkdir -p ~/.claude/skills/cfr-refs
cp skill/cfr-refs-SKILL.md ~/.claude/skills/cfr-refs/SKILL.md
```

**Windows (PowerShell):**
```powershell
mkdir -Force "$env:USERPROFILE\.claude\skills\cfr-refs"
copy skill\cfr-refs-SKILL.md "$env:USERPROFILE\.claude\skills\cfr-refs\SKILL.md"
```

> **Note:** You don't need to copy the cfr-refs.js file because after typing `npm link` you made `cfr-refs` a globally available command in your machine.

Then in any Claude Code session, run `/cfr-refs` and describe the regulatory workflow you want to diagram.

## Claude.ai Project Skill

You can also use cfr-refs as a skill in a [Claude.ai](https://claude.ai) chat project (the online version, not Claude Code). See [INSTALL-ONLINE-PROJECT-SKILL.md](INSTALL-ONLINE-PROJECT-SKILL.md) for setup and usage instructions in that chat environment.

## License

This project is licensed under the [Apache License 2.0](LICENSE) License.
