---
name: cfr-refs
description: Generate interactive HTML regulatory diagrams using the cfr-refs tool. Use this skill whenever the user wants to create a CFR/regulatory diagram, timeline, flowchart, sequence diagram, swim-lane lifecycle chart, compliance calendar, or state lifecycle map for any federal regulation process. Triggers on mentions of CFR, regulatory diagrams, USF, USAC, FCC, compliance workflows, regulatory timelines, or lifecycle diagrams.
---

# cfr-refs — Generate Regulatory Diagrams

Turn a description of a regulatory process into a styled, self-contained, interactive HTML diagram where users can click to reveal quoted CFR text.

`cfr-refs.js` supports **six layout types**, selected by `"layout"` in the JSON config:

| Layout | Best for | Key JSON field |
|--------|----------|----------------|
| `events` | Chronological milestones on a vertical spine | `sections` |
| `timeline` | Gantt-style bars showing program durations | `periods` |
| `lifecycle` | Swim-lane grid — lanes as rows, stages as columns | `lanes`, `stages` |
| `lifecycle-t` | Swim-lane grid — lanes as columns, stages as rows | `lanes`, `stages` |
| `flowchart` | Decision-heavy processes with branching logic | `nodeMap` + Mermaid `.mmd` |
| `sequence` | Multi-entity interaction timelines | `phases` + Mermaid `.mmd` |
| `state` | Entity status lifecycle (subscriber, carrier, etc.) | `stateMap` + Mermaid `.mmd` |
| `gantt` | Compliance deadlines and filing windows | `taskMap` + Mermaid `.mmd` |

---

## Usage

```bash
cfr-refs <config.json> [-o output.html]
```

- The script uses only Node.js built-ins — no `npm install` needed.
- `cfr-refs.js` must be in the working directory (or reference it by path).
- Output defaults to `<config-basename>.html`.

---

## When to Use Which Layout

**`events`** — Regulatory history: key rule changes, FCC orders, program launches over decades. Vertical spine with clickable event dots.

**`timeline`** — Overlapping program components or funding mechanisms on a shared time axis. Horizontal Gantt-style bars; click a bar to see its CFR refs.

**`lifecycle`** — Full funding lifecycle with multiple actors (applicant, provider, USAC, FCC). Swim-lane grid; each cell is a step, connections show flow. Use when stages are the primary axis and actors (lanes) are secondary.

**`lifecycle-t`** — Same as `lifecycle` but transposed: lanes run left-to-right as columns, stages run top-to-bottom as rows. Use when there are more stages than lanes, or when the diagram needs to fit portrait/tall layout.

**`flowchart`** — Decision trees, yes/no branches, approval vs. denial paths. Uses Mermaid `flowchart TD`. Click any node to see its CFR text.

**`sequence`** — Back-and-forth message exchanges between named participants (consumer, USAC, provider, FCC). Uses Mermaid `sequenceDiagram`. Phase cards below diagram link to CFR refs.

**`state`** — What status can a regulated entity be in, and what rules apply in each status? Uses Mermaid `stateDiagram-v2`. Click any state node.

**`gantt`** — When does each obligation occur, how do deadlines overlap across the calendar year? Uses Mermaid `gantt`. Click any task bar.

---

## File Naming Convention

```
<n>-<short-name>-<layout>.html
```

Examples:
- `erate-lifecycle.html`, `erate-lifecycle-t.html`
- `lifeline-events.html`, `lifeline-timeline.html`
- `contributions-flow.html`, `lifeline-state.html`

---

## Shared JSON Fields (all layouts)

```json
{
  "title":       "Program Name — Description",
  "subtitle":    "47 CFR Part 54, Subpart X (§§ XX.XXX – XX.XXX)",
  "borderColor": "#3b82f6",
  "layout":      "lifecycle",
  "defined": {
    "54.500": ["Short title", "Full quoted regulatory text..."],
    "54.501": ["Another section", "Quoted text..."]
  },
  "acronyms": {
    "ETC":  "Eligible Telecommunications Carrier",
    "USAC": "Universal Service Administrative Company",
    "FCC":  "Federal Communications Commission",
    "USF":  "Universal Service Fund"
  }
}
```

- **`title`** — Required. Page heading.
- **`subtitle`** — Optional. CFR subpart reference shown beneath the title.
- **`borderColor`** — Required. Left accent color. Use the program's canonical color (see below).
- **`layout`** — Required. One of the six layout names above.
- **`defined`** — Required. Map of CFR section keys → `[shortTitle, quotedText]`. All refs used anywhere in the diagram must have an entry here.
- **`acronyms`** — Optional but **strongly recommended**. Map of all-caps acronym tokens → full expansion. Any matching token anywhere in diagram text (card titles, item bullets, lane labels, stage headers, connection labels, event labels, period labels) automatically receives a hover tooltip showing its expansion. The tooltip appears as a lightweight dark pill near the cursor, distinct from the CFR ref modal. Acronym tooltips also appear inside CFR ref popups (on section short-titles and quoted text) and in the page header area (title, subtitle, lightbulb instruction box).

  **Token matching rules:**
  - Standard all-caps: `ETC`, `USAC`, `FCC`, `USF`, `CAF-BLS` (hyphenated segments supported)
  - Lowercase-prefix forms: `eCFR`, `iOS` — a single leading lowercase letter followed by two or more caps
  - Plurals: `ETCs` matches key `ETC`; tooltip always shows the base form
  - Mixed-case words (`eRate`, `iPhone`) are never matched

  **Built-in acronyms (always active, no JSON entry needed):**

  | Token | Expansion |
  |-------|-----------|
  | `CFR` | Code of Federal Regulations |
  | `eCFR` | Electronic Code of Federal Regulations |
  | `USC` | United States Code |
  | `FR` | Federal Register |
  | `OMB` | Office of Management and Budget |
  | `GAO` | Government Accountability Office |
  | `FCC` | Federal Communications Commission |
  | `USAC` | Universal Service Administrative Company |
  | `USF` | Universal Service Fund |
  | `FTC` | Federal Trade Commission |
  | `DOJ` | Department of Justice |
  | `USPS` | United States Postal Service |
  | `iOS` | Apple mobile operating system |

  User-provided entries in `acronyms` override built-ins on collision. **Always include every domain-specific acronym that appears in the diagram** (ETC, NLAD, HCLS, CAF-BLS, etc.) — the built-ins only cover the universal regulatory layer.

### Canonical Program Colors

| Program | Color | Hex |
|---------|-------|-----|
| E-Rate (Subpart F) | Blue | `#2563eb` |
| Lifeline (Subpart E) | Violet | `#8b5cf6` |
| High Cost (Subpart D) | Amber | `#d97706` |
| Rural Health Care (Subpart G) | Emerald | `#059669` |
| USF Contributions (Subpart H) | Cyan | `#0e7490` |

---

## Automatic eCFR Hyperlinks (header area only)

The generator automatically converts CFR citation patterns in the page **title**, **subtitle**, and **lightbulb instruction box** into clickable links to [ecfr.gov](https://www.ecfr.gov). This requires no JSON configuration — it is pattern-matched at build time.

### Patterns recognized

| Pattern in text | Link target |
|----------------|-------------|
| `Title 47 CFR` | `ecfr.gov/current/title-47` |
| `47 CFR Part 54` | `ecfr.gov/current/title-47/part-54` |
| `47 CFR` (no Part) | `ecfr.gov/current/title-47` |
| `Title 47` | `ecfr.gov/current/title-47` |
| `(§ 54.8)` or `(§§ 54.8 – 54.11)` | each section number → `ecfr.gov/current/title-47/section-54.8` etc. |

The title number (47, 42, etc.) and part/section numbers are generalized — any number works, not just Title 47. Section links within parentheticals require at least one `§` character inside the parens, and the title number is inferred from the nearest preceding title reference in the same string. All links open in a new tab.

**Best practice:** Write subtitles as `"47 CFR Part 54, Subpart F (§§ 54.500 – 54.523)"` — the part and each section will be individually linked.

Vertical spine with era sections and clickable event dots.

```json
{
  "layout": "events",
  "sections": [
    {
      "label": "1996–2000 Founding",
      "events": [
        {
          "year": "1996",
          "label": "Telecommunications Act creates Universal Service Fund",
          "refs": ["54.300", "54.301"]
        }
      ]
    }
  ]
}
```

- Each `section` has a `label` (era heading) and `events` array.
- Each event: `year` (string), `label` (description), `refs` (array of keys from `defined`).
- Clicking an event dot opens a tooltip with the quoted CFR text.

---

## Layout: `timeline`

Horizontal bars on a shared year axis.

```json
{
  "layout": "timeline",
  "periods": [
    {
      "label": "Lifeline Voice Support",
      "start": 1985,
      "end":   null,
      "color": "#8b5cf6",
      "refs":  ["54.400", "54.401"]
    }
  ]
}
```

- Each period: `label`, `start` (year int), `end` (year int or `null` for ongoing), optional `color`, `refs`.
- `end: null` draws the bar to the right edge with a dashed border, labeled "Ongoing".
- Clicking a bar opens a tooltip with CFR text.

---

## Layout: `lifecycle` and `lifecycle-t`

SVG swim-lane grid. Both use identical JSON — only the `layout` value differs.

```json
{
  "layout": "lifecycle",
  "lanes": [
    { "id": "applicant", "label": "Applicant / School" },
    { "id": "provider",  "label": "Service Provider" },
    {
      "id": "usac",
      "label": "USAC / Schools & Libraries Division",
      "color": "#006FF4",
      "textColor": "#ffffff",
      "borderColor": "#3b85f5",
      "logo": { "src": "./usac-logo.png", "alt": "USAC" }
    },
    {
      "id": "fcc",
      "label": "FCC",
      "color": "#134b96",
      "textColor": "#ffffff",
      "borderColor": "#1d62c8",
      "logo": { "src": "data:image/png;base64,...", "alt": "FCC" }
    }
  ],
  "stages": [
    {
      "number": 1,
      "label": "Register",
      "cells": {
        "applicant": {
          "id": "app-1",
          "label": "Create Billed Entity\nin EPC Portal",
          "refs": ["54.504"]
        },
        "usac": {
          "id": "usac-1",
          "label": "Assign Billed Entity\nNumber (BEN)",
          "refs": ["54.504"]
        }
      }
    }
  ],
  "connections": [
    {
      "from": "app-1",
      "to":   "usac-1",
      "label": "§ 54.504",
      "color": "#2563eb"
    }
  ],
  "spans": [
    {
      "stageNumbers": [2, 3],
      "laneId": "provider",
      "label": "Competitive Bidding Window\n§ 54.503"
    }
  ]
}
```

### `lanes` array

Each lane:
- **`id`** — Identifier string used as key in `cells` and `spans`.
- **`label`** — Display name for the lane header.
- **`color`** — Optional hex. Background fill used for the lane header when `highlight: true`. Defaults to `#f8fafc` (light gray).
- **`textColor`** — Optional hex. Text color for the lane label. Defaults to `#334155`.
- **`borderColor`** — Optional hex. Stroke color for the lane header and card borders within the lane. Also the source color for the pastel header background when not highlighted. Defaults to `#e2e8f0`.
- **`highlight`** — Optional boolean. When `true`, the lane header background uses the full `color` value (dark/vivid) to visually distinguish this actor's role. All other lanes always render with a pastel header background derived from `borderColor`. **Default: `false` — no lane is highlighted unless explicitly requested.** Only set `highlight: true` when the user has specifically asked to focus on one actor's role in the lifecycle. When a lane is highlighted, every cell in that lane must include an `owners` field naming the specific department or sub-unit responsible for that task (e.g. `"owners": "Finance Division"`). If the cell contains substeps (`items`) that belong to different sub-units within that actor, set `owner` on each individual item instead of (or in addition to) the cell-level `owners` — use `owners` for a summary badge when sub-owners differ, and `owner` on each item to attribute the specific bullet.
- **`logo`** — Optional, but **preferred for all named institutional lanes**. Logos make lane headers immediately recognisable and should always be included for USAC, FCC, and FCC Enforcement Bureau. Omit only when genuinely unavailable or for generic role lanes (e.g. "Applicant", "Provider"). The logo mark appears above the label text (`lifecycle`) or to the left of the label (`lifecycle-t`). Independent of `color` — set both to get a branded background with a logo.
  - **`src`** — Either a base64 data URI (`"data:image/png;base64,..."`) or a file path relative to the JSON config (e.g. `"./usac-logo.png"`). File paths are read and embedded at build time, so the output HTML is fully self-contained.
  - **`alt`** — Accessible label for the logo (used as SVG `<title>`).
  - **`url`** — Optional. When present, the logo becomes a clickable link that opens this URL in a new tab (`target="_blank"`). Use the official homepage or the page where the logo was sourced (e.g. agency homepage, Wikipedia/Wikimedia page).
  ```json
  "logo": { "src": "data:image/png;base64,iVBORw0KGgo...", "alt": "USAC", "url": "https://www.usac.org" }
  ```
  **Institutional brand colors and logos (USF actors):**
  | Actor | `color` | `textColor` | `logo.url` |
  |-------|---------|-------------|------------|
  | USAC | `#006FF4` | `#ffffff` | `https://www.usac.org` |
  | FCC | `#134b96` | `#ffffff` | `https://www.fcc.gov` |
  | FCC Enforcement Bureau | `#1d2b3e` | `#ffffff` | `https://www.fcc.gov/enforcement` |
  | ETCs / Recipients | *(role-based — no canonical color)* | | *(omit logo)* |

  Logo files can be sourced from official agency websites. **Including a logo is strongly preferred for named institutional lanes** — omit only when no suitable logo asset is available or for generic role lanes like "Applicant".

### `stages` array

Each stage:
- **`number`** — Integer (1-based). Used as the stage identifier in connections.
- **`label`** — Stage heading (shown in the column/row header).
- **`cells`** — Object keyed by `lane.id`. Each cell:
  - **`id`** — Unique cell identifier used in `connections`.
  - **`title`** — Cell heading, shown in the accent-colored title band. Use `\n` for line breaks. (Replaces `label` for lifecycle cells.)
  - **`refs`** — Array of CFR section keys from `defined`. Clicking the cell body shows these refs.
  - **`annotations`** — Optional. Array of `{ "label", "text", "color" }` objects. Each renders a colored badge strip below the title band; clicking opens a tooltip with `text`. The card gets a dashed border and tinted background derived from the first annotation's `color`. Omit for standard cells.
    - **`label`** — Badge text including icon, e.g. `"⚠ Note"` or `"♦ Decision"`.
    - **`text`** — Tooltip body content shown on badge click.
    - **`color`** — Hex color for the badge band and card tint, e.g. `"#fbbf24"` (amber).
    ```json
    "annotations": [{ "label": "♦ Decision", "text": "Explanation…", "color": "#fbbf24" }]
    ```
  - **`items`** — Optional. Array of bullet points shown in the card body. Each entry is either:
    - A plain string: `"Ban is entity-level, not component-origin"`
    - An object with optional per-bullet department attribution:
      ```json
      { "text": "Issue funding commitment", "owner": "Finance Div." }
      ```
      When `owner` is present, a muted italic `— Finance Div.` line is rendered directly below that bullet.
  - **`owners`** — Optional string. Renders as a small pill badge below the title band, naming the owning department(s) (e.g. `"Finance Div. + Program Div."`). When all substeps in a cell belong to the same sub-unit, `owners` alone is sufficient. When substeps within the same cell belong to **different** sub-units of the same actor, set `owner` on each individual `items` entry to attribute each bullet specifically — and set `owners` to a summary string (e.g. `"Finance Div. + Audit Div."`) so the badge still signals shared ownership at a glance.
  - **`diamond`** — Optional boolean. If `true`, renders as a decision diamond.

**Annotated cell rendering:**

| Has `annotations`? | Border | Badge strip | Badge click | Body click |
|--------------------|--------|-------------|-------------|------------|
| No | Solid accent | — | — | Opens CFR refs |
| Yes | Dashed in annotation color | One row per annotation | Opens tooltip text | Opens CFR refs |

### `connections` array

Each connection:
- **`from`** — Cell `id` (source).
- **`to`** — Cell `id` (destination).
- **`label`** — Optional. Short label shown on the arrow (e.g., `"§ 54.503"`).
- **`color`** — Optional hex. Defaults to `#64748b`.

Arrow routing is automatic:
- Same-lane connections route vertically along the lane spine.
- Cross-lane connections route with L-shapes (adjacent lanes) or smooth bezier arcs (spanning multiple lanes).
- Arrowheads are explicit polygons oriented to the actual arrival angle.

### `spans` array (optional)

Spans visually merge adjacent cells in one lane across multiple stages:

- **`stageNumbers`** — Array of consecutive stage numbers to span.
- **`laneId`** — Which lane.
- **`label`** — Text displayed inside the span bar.

Spans are decorative — they don't define cells or affect routing.

### Decision diamonds

Add `"diamond": true` to any cell. The cell renders as a rotated square. Connections from decision cells typically carry `label` values like `"Approved"` or `"Denied"`.

---

## Layout: `flowchart`

Requires a Mermaid diagram provided via `"mermaid"` (inline string) or `"mermaidFile"` (path to `.mmd`).

```json
{
  "layout": "flowchart",
  "nodeMap": {
    "A": ["54.500", "54.501"],
    "B": ["54.503"],
    "C": []
  },
  "mermaid": "flowchart TD\n    A[\"Apply\\n&#167;54.500\"] --> B{\"Eligible?\\n&#167;54.501\"}\n    B -- Yes --> C[\"Approved\"]\n    B -- No  --> D[\"Denied\"]\n    style A fill:#1e40af,color:#fff,stroke:#1e3a8a\n    style B fill:#f97316,color:#fff,stroke:#ea580c\n    style C fill:#16a34a,color:#fff,stroke:#15803d\n    style D fill:#dc2626,color:#fff,stroke:#b91c1c"
}
```

- **`nodeMap`** — Maps Mermaid node IDs (single uppercase letters) to arrays of CFR section keys. Nodes with no refs use `[]`.
- Use `{}` braces for decision/diamond nodes, `[]` for regular nodes.
- Include `&#167;XX.XXX` in node labels.
- Apply `style` directives at the end of the Mermaid block.

### Node color conventions

| Role | Fill | Text | Stroke |
|------|------|------|--------|
| Start / Registration | `#1e40af` | `#fff` | `#1e3a8a` |
| Waiting / Pending | `#fbbf24` | `#000` | `#f59e0b` |
| Decision | `#f97316` | `#fff` | `#ea580c` |
| Approval / Funding | `#16a34a` | `#fff` | `#15803d` |
| Denial / Enforcement | `#dc2626` | `#fff` | `#b91c1c` |

---

## Layout: `sequence`

Requires a Mermaid `sequenceDiagram`.

```json
{
  "layout": "sequence",
  "phases": [
    {
      "num":  "1",
      "name": "Application",
      "desc": "Consumer submits a Lifeline application to the National Verifier.",
      "refs": ["54.409", "54.410"]
    },
    {
      "num":  "★",
      "name": "Ongoing Compliance",
      "desc": "USAC audits providers annually.",
      "refs": ["54.420"]
    }
  ],
  "mermaid": "sequenceDiagram\n    participant C as Consumer\n    participant NV as USAC: National Verifier\n    note over C,NV: PHASE 1 — APPLICATION\n    C->>NV: Submit application\n    NV-->>C: Confirmation"
}
```

- **`phases`** — Array of `{ num, name, desc, refs }`. Rendered as clickable cards below the diagram; clicking opens a modal with full CFR text.
- Use `note over` spanning notes in the `.mmd` matching phase names for visual phase markers.
- `num` can be `"1"`, `"2"`, or special values like `"★"`.

---

## Layout: `state`

Requires a Mermaid `stateDiagram-v2`.

```json
{
  "layout": "state",
  "legend": [
    { "color": "#1e40af", "label": "Entry Point" },
    { "color": "#059669", "label": "Active" },
    { "color": "#dc2626", "label": "Terminal / De-enrolled" }
  ],
  "stateMap": {
    "Active":      ["54.401", "54.403"],
    "CurePeriod":  ["54.405"]
  },
  "phases": [],
  "mermaid": "stateDiagram-v2\n    [*] --> Active\n    state \"Active\\n<i>§ 54.401</i>\" as Active\n    classDef active fill:#059669,color:#fff,stroke:#047857\n    class Active active"
}
```

- **`stateMap`** — Maps Mermaid state IDs (the `as ID` identifiers) to CFR section key arrays. Must match `.mmd` identifiers exactly (case-sensitive).
- **`legend`** — Optional. Color legend matching `classDef` colors in the `.mmd`.
- **`phases`** — Optional. If provided, phase cards appear below the diagram (same as sequence mode).
- Include `§ XX.XXX` in state labels using `state "Name<br/><i>§ XX.XXX</i>" as ID` — these become clickable automatically.

---

## Layout: `gantt`

Requires a Mermaid `gantt`.

```json
{
  "layout": "gantt",
  "todayMarker": false,
  "taskMap": {
    "Monthly claims filing (§ 54.407)":       ["54.407"],
    "Annual recertification (§ 54.410(f))":   ["54.410(f)"]
  },
  "phases": [
    {
      "num":  "1",
      "name": "Reimbursement",
      "desc": "Monthly claims filing for Lifeline support.",
      "refs": ["54.407"]
    }
  ],
  "mermaid": "gantt\n    title Lifeline Compliance Calendar\n    dateFormat YYYY-MM-DD\n    axisFormat %b\n    section Reimbursement\n    Monthly claims filing (§ 54.407) :claims, 2025-01-01, 365d"
}
```

- **`taskMap`** — Maps the exact task label text from the `.mmd` to CFR section key arrays. Labels must match verbatim (including the `§ XX.XXX` portion).
- **`todayMarker`** — Optional boolean. If `true`, shows a vertical red line at today's date. Default: `false`.
- **`phases`** — Optional. Phase cards appear below the chart.
- Use `section` directives in `.mmd` to group tasks. Section titles become clickable if they match a `phases[].name`.

---

## Workflow

1. Decide which layout best fits the regulatory process (see "When to Use Which Layout").
2. Look up the relevant CFR sections on eCFR (https://ecfr.gov) and collect quoted text for `defined`.
3. Build the JSON config with all required fields.
4. For Mermaid layouts, write the `.mmd` content and embed it in `"mermaid"` (or as `"mermaidFile"`).
5. Run `node cfr-refs.js <config.json> -o <output.html>`.
6. Verify output — check that all clickable elements show correct CFR text.

---

## Quality Checklist

### All layouts
- [ ] `title` and `borderColor` are set
- [ ] Every CFR key referenced anywhere appears in `defined`
- [ ] `defined` descriptions are substantive 1–3 sentence summaries of the actual regulatory text
- [ ] `acronyms` map includes every **domain-specific** all-caps token used in the diagram (ETC, USAC, NLAD, HCLS, CAF-BLS, etc.) — universal regulatory tokens (CFR, eCFR, USC, FR, FCC, USAC, USF, OMB, GAO) are built-in and need not be repeated unless you want to override the default expansion
- [ ] Output filename follows naming convention

### `events` / `timeline`
- [ ] `refs` arrays in events/periods reference valid keys in `defined`
- [ ] Timeline `start`/`end` years are plausible; `null` only for genuinely ongoing programs

### `lifecycle` / `lifecycle-t`

#### Identifying decision cells — scan for these patterns before drafting the JSON

A cell should carry `"annotations": [{ "label": "♦ Decision", ... }]` whenever the process branches depending on an outcome rather than advancing unconditionally. Scan for these patterns:

1. **Downstream reversal signal (most reliable).** If any cell later in the diagram represents a negative or reversed outcome — "Designation Reversed", "No violation", "Denied", "Not confirmed", "Case closed", "Application withdrawn" — trace back to the cell that initiated that track. That ancestor cell is the decision point, even if it has a procedural-sounding name like "Initiate NS Designation" or "Review Application". A negative-outcome cell with no upstream Decision annotation is a red flag.

2. **Regulatory proceedings.** Any cell that *initiates* a proceeding where an agency makes a formal determination is a decision point: designation proceedings, waiver proceedings, enforcement investigations, eligibility audits, funding commitment reviews. The proceeding cell is the fork; the downstream cells are the outcome branches. Name alone can mislead — "Initiate", "Review", "Assess", "Investigate" cells are almost always decision points.

3. **Discretionary enforcement.** Any cell where an agency *may* take action but is not required to — suspension, debarment, recovery, audit referral — is a decision point. The "no action" branch is a valid outcome even if it isn't explicitly represented as a downstream cell. The annotation text should state that the enforcement action is discretionary.

4. **Condition checks.** Any cell whose title implies a conditional — "Potential Violation Identified", "Gap Detected", "Flag Raised", "Threshold Exceeded" — is a decision point. The condition can resolve true (enforcement path) or false (compliant/no-action path).

**Decision annotation text should state:** (a) what the decision-maker must determine, (b) what CFR provision governs the determination, and (c) what happens on each branch.

#### Classifying cells into the right stage — activity-verb test

A cell's stage must reflect what the actor is *doing in that step*, not what its outcome enables downstream. Before placing a cell, identify its **primary activity verb** and match it to a stage type:

| Activity verb | Stage type | Examples |
|---|---|---|
| Receive, disburse, fund, pay, reimburse | **Finance / Disbursement** | USAC issues funding commitment; carrier receives support payment |
| Apply, certify, file, report, attest | **Certification / Compliance** | ETC certifies equipment compliance; USAC receives 499 filing |
| Monitor, audit, inventory, detect, flag, suspect | **Detection** | USAC finds covered equipment in network; EB identifies false claims |
| Investigate, initiate proceeding, assess, review, determine, conclude, find | **Adjudication / Determination** | PSHSB conducts NS designation proceeding and issues finding |
| Order, prohibit, suspend, debar, sanction, publish Federal Register notice | **Enforcement Action** | EB issues suspension notice; FCC designation order takes effect |
| Repay, replace, remediate, close, restore, exclude | **Resolution** | ETC repays recovered funds; EB debarment period ends |

**Key misclassification traps:**

- **"Determination" ≠ enforcement action.** A finding or conclusion belongs in the Adjudication/Detection stage, even if it immediately triggers an enforcement step. The enforcement action is the *order or sanction* that follows from the determination, not the determination itself.
- **"Initiate proceeding" ≠ detection.** Opening a formal proceeding is adjudicative work; place it in a Determination/Adjudication stage. Reserve Detection for the monitoring or audit activity that *precedes* the formal proceeding.
- **Stage name can mislead.** Trust the activity verb, not the stage label. If "Detect Violation" is the closest stage but the activity is a formal determination, either rename the stage or add a new Adjudication stage between Detection and Enforcement.
- **Consequence ≠ activity.** A cell whose outcome *causes* enforcement does not belong in the Enforcement stage — that just means it has a downstream connection to an enforcement cell. Place it where its own activity fits, then draw the arrow.

**Test:** Cover the stage header and read only the cell title and items. If the activity verb points to a different stage type than the one it's currently in, move the cell.

#### Checklist

- [ ] **Every cell passes the activity-verb test** — its primary verb (disburse, certify, detect, determine, order, resolve) matches the stage type it is placed in. Cells classified by their downstream *consequence* rather than their own *activity* are a red flag.
- [ ] No lane has `highlight: true` unless the user explicitly asked to focus on that actor's role
- [ ] Every highlighted lane has `owners` populated on all its cells
- [ ] Lanes representing named institutions (USAC, FCC, FCC Enforcement Bureau) use institutional brand colors and `logo` where available; generic role lanes (Applicant, Provider) omit `logo`
- [ ] Logo `src` values are base64 data URIs or resolvable file paths — not remote URLs (which break offline viewing)
- [ ] Every cell `id` referenced in `connections` exists in a stage's `cells` object
- [ ] Every `laneId` in `spans` matches a lane's `id`
- [ ] `stageNumbers` in `spans` are consecutive and all present in `stages`
- [ ] Decision cells with `"diamond": true` have meaningful branch labels on outgoing connections
- [ ] Connection `color` values are consistent with program color or phase meaning
- [ ] Cells with multiple sub-owners use `owners` for the summary and per-item `owner` on `items` entries where individual bullets belong to different departments
- [ ] Cells with `annotations` use the `annotations` array (not the old `type`/`notes`/`decisions` fields)
- [ ] **Scanned for all four decision detection patterns above before marking any cell as a decision point**
- [ ] **Every cell with a decision annotation has at least two outgoing connections** — one for each possible outcome. A decision point with only one outgoing arrow is almost certainly missing a path (e.g. the "no violation" / "approved" / "not applicable" branch). Verify both the affirmative and negative outcomes are represented before finalizing the diagram.
- [ ] **No negative-outcome cell (Reversed, Denied, Not confirmed, No violation, Closed) lacks a Decision-annotated ancestor** — if one does, a decision annotation is missing upstream.
- [ ] Decision annotation `label` values make the branching logic legible on the badge (e.g. `"♦ Decision"` plus outgoing arrow labels like `"No violation"` / `"Equipment ban § 54.10"`)

### `flowchart`
- [ ] Every node ID in `nodeMap` appears in the `.mmd`
- [ ] Decision nodes use `{}` braces
- [ ] Node labels include `&#167;XX.XXX` reference
- [ ] `style` directives applied at the end of the `.mmd`

### `sequence`
- [ ] Phase `num` values are sequential (special values like `★` allowed)
- [ ] Phase descriptions are substantive, not just the title repeated
- [ ] `note over` spans in `.mmd` correspond to phase names

### `state`
- [ ] `stateMap` keys match the `as ID` identifiers in `.mmd` exactly (case-sensitive)
- [ ] `classDef` colors in `.mmd` match `legend` entries (if legend provided)
- [ ] State labels include `§ refs` using `state "Name<br/><i>§ XX.XXX</i>" as ID`

### `gantt`
- [ ] `taskMap` keys match task labels in `.mmd` verbatim
- [ ] `section` names in `.mmd` match `phases[].name` if phase cards are used
- [ ] `dateFormat YYYY-MM-DD` is present in `.mmd`

