#!/usr/bin/env node
/**
 * cfr-refs.js — CFR Regulatory Diagram Generator
 *
 * Generates a self-contained interactive HTML diagram from a JSON config.
 * Uses only Node.js built-ins for native layouts; loads Mermaid from CDN
 * for Mermaid-based layouts.
 *
 * Six layouts, selected by "layout" field in JSON (default: "events"):
 *
 *   "events"    — Stacked era sections with event dots on a vertical spine.
 *   "timeline"  — Gantt-style chart with one horizontal bar per program.
 *   "lifecycle" — SVG swim-lane grid: lanes as rows, stages as columns.
 *   "lifecycle-t"— SVG swim-lane grid: lanes as columns, stages as rows.
 *   "flowchart" — Mermaid flowchart TD with clickable nodes (nodeMap).
 *   "sequence"  — Mermaid sequenceDiagram with phase-card panel (phases).
 *   "state"     — Mermaid stateDiagram-v2 with clickable states (stateMap).
 *   "gantt"     — Mermaid gantt chart with clickable task bars (taskMap).
 *
 * Usage:
 *   node cfr-refs.js <config.json> [-o output.html]
 *
 * ── Vertical JSON schema ──────────────────────────────────────────────────────
 * {
 *   "title":       "Program Name — Regulatory History",
 *   "subtitle":    "47 CFR Part 54, Subpart X — Key Milestones YYYY–YYYY",
 *   "borderColor": "#0e7490",
 *   "layout":      "events",
 *   "defined": { "54.300": ["Short title", "Quoted text..."] },
 *   "sections": [
 *     {
 *       "label": "1996–2000 Founding",
 *       "events": [
 *         { "year": "1996", "label": "Telecom Act creates High Cost Fund", "refs": ["54.300"] }
 *       ]
 *     }
 *   ]
 * }
 *
 * ── Horizontal JSON schema ────────────────────────────────────────────────────
 * {
 *   "title":       "Lifeline Program Components",
 *   "subtitle":    "47 CFR Part 54, Subpart E — Active Programs 1985–2024",
 *   "borderColor": "#8b5cf6",
 *   "layout":      "timeline",
 *   "defined": { "54.400": ["Lifeline defined", "Quoted text..."] },
 *   "periods": [
 *     {
 *       "label": "Lifeline Voice Support",
 *       "start": 1985,
 *       "end":   null,        // null = ongoing (draws to right edge with dashed border)
 *       "color": "#8b5cf6",  // optional per-program color override
 *       "refs":  ["54.400", "54.401"]
 *     }
 *   ]
 * }
 */

"use strict";
const fs   = require("fs");
const path = require("path");

// ── CLI ──────────────────────────────────────────────────────────────────────

function usage() {
  console.log(`
Usage: node cfr-refs.js <config.json> [-o output.html]

Options:
  -o, --output <file>   Output HTML file (default: derived from config filename)
  -h, --help            Show this help
`);
  process.exit(0);
}

const args = process.argv.slice(2);
if (!args.length || args.includes("-h") || args.includes("--help")) usage();

let configPath = null;
let outputPath = null;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) {
    outputPath = args[++i];
  } else if (!configPath) {
    configPath = args[i];
  }
}

if (!configPath) { console.error("Error: config.json path required."); process.exit(1); }

// ── Load config ──────────────────────────────────────────────────────────────

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch (e) {
  console.error(`Error reading config: ${e.message}`); process.exit(1);
}

if (!config.title)       { console.error('Error: config missing "title".');       process.exit(1); }
if (!config.borderColor) { console.error('Error: config missing "borderColor".'); process.exit(1); }
if (!config.defined)     { console.error('Error: config missing "defined".');     process.exit(1); }

// ── Load Mermaid content (for Mermaid-based layouts) ────────────────────────

const configDir = path.dirname(path.resolve(configPath));
let mermaidContent = "";
if (config.mermaid) {
  mermaidContent = config.mermaid.trim();
} else if (config.mermaidFile) {
  const mmdPath = path.resolve(configDir, config.mermaidFile);
  try { mermaidContent = fs.readFileSync(mmdPath, "utf-8").trim(); }
  catch (e) { console.error(`Error reading mermaid file "${mmdPath}": ${e.message}`); process.exit(1); }
}

// Auto-detect Mermaid mode from first line of content
let mermaidMode = null;
if (mermaidContent) {
  const fl = mermaidContent.split("\n")[0].trim().toLowerCase();
  if (fl.startsWith("sequencediagram"))  mermaidMode = "sequence";
  else if (fl.startsWith("statediagram")) mermaidMode = "state";
  else if (fl.startsWith("gantt"))        mermaidMode = "gantt";
  else                                    mermaidMode = "flowchart";
}

const layout = (config.layout || "events").toLowerCase();

if (layout === "events") {
  if (!Array.isArray(config.sections) || !config.sections.length) {
    console.error('Error: vertical layout requires a non-empty "sections" array.'); process.exit(1);
  }
} else if (layout === "timeline") {
  if (!Array.isArray(config.periods) || !config.periods.length) {
    console.error('Error: timeline layout requires a non-empty "periods" array.'); process.exit(1);
  }
} else if (layout === "lifecycle") {
  if (!Array.isArray(config.lanes) || !config.lanes.length) {
    console.error('Error: lifecycle layout requires a non-empty "lanes" array.'); process.exit(1);
  }
  if (!Array.isArray(config.stages) || !config.stages.length) {
    console.error('Error: lifecycle layout requires a non-empty "stages" array.'); process.exit(1);
  }
} else if (layout === "lifecycle-t") {
  if (!Array.isArray(config.lanes) || !config.lanes.length) {
    console.error('Error: lifecycle-t layout requires a non-empty "lanes" array.'); process.exit(1);
  }
  if (!Array.isArray(config.stages) || !config.stages.length) {
    console.error('Error: lifecycle-t layout requires a non-empty "stages" array.'); process.exit(1);
  }
} else if (layout === "flowchart" || layout === "sequence" || layout === "state" || layout === "gantt") {
  if (!mermaidContent) {
    console.error(`Error: layout "${layout}" requires "mermaid" or "mermaidFile" in config.`); process.exit(1);
  }
  // Per-mode required fields
  if (layout === "flowchart" && !config.nodeMap) {
    console.error('Error: flowchart layout requires "nodeMap" in config.'); process.exit(1);
  }
  if (layout === "sequence" && !config.phases) {
    console.error('Error: sequence layout requires "phases" in config.'); process.exit(1);
  }
  if (layout === "state" && !config.stateMap) {
    console.error('Error: state layout requires "stateMap" in config.'); process.exit(1);
  }
  if (layout === "gantt" && !config.taskMap) {
    console.error('Error: gantt layout requires "taskMap" in config.'); process.exit(1);
  }
} else {
  console.error(`Error: unknown layout "${layout}". Use "events", "timeline", "lifecycle", "lifecycle-t", "flowchart", "sequence", "state", or "gantt".`); process.exit(1);
}

if (!outputPath) {
  const base = path.basename(configPath, path.extname(configPath));
  outputPath = base + ".html";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Convert "#rrggbb" + alpha (0–1) → "rgba(r,g,b,a)" for SVG compatibility
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Blend "#rrggbb" toward white: amount=0 → white, amount=1 → full color
// Produces an opaque tint with proper saturation (no grey-fallback risk)
function hexTint(hex, amount) {
  const h = hex.replace("#", "");
  const r = Math.round(255 + (parseInt(h.slice(0,2), 16) - 255) * amount);
  const g = Math.round(255 + (parseInt(h.slice(2,4), 16) - 255) * amount);
  const b = Math.round(255 + (parseInt(h.slice(4,6), 16) - 255) * amount);
  return `rgb(${r},${g},${b})`;
}

// ── Mermaid data-structure builders ─────────────────────────────────────────

function buildDefined(defined) {
  const entries = Object.entries(defined).map(([key, [title, desc]]) =>
    `"${jsStr(key)}":["${jsStr(title)}","${jsStr(desc)}"]`);
  return `{\n${entries.join(",\n")}\n}`;
}

function buildNodeMap(nodeMap) {
  const entries = Object.entries(nodeMap).map(([key, refs]) => {
    const arr = refs.map(r => `"${jsStr(r)}"`).join(",");
    return `"${jsStr(key)}":[${arr}]`;
  });
  return `{${entries.join(",")}}`;
}

function buildPhases(phases) {
  const entries = phases.map(p => {
    const refs = p.refs.map(r => `"${jsStr(r)}"`).join(",");
    return `{"num":"${jsStr(p.num)}","name":"${jsStr(p.name)}","desc":"${jsStr(p.desc)}","refs":[${refs}]}`;
  });
  return `[\n${entries.join(",\n")}\n]`;
}

function jsStr(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildDefined(defined) {
  const entries = Object.entries(defined).map(([k, v]) =>
    `"${jsStr(k)}":[${v.map(s => `"${jsStr(s)}"`).join(",")}]`
  );
  return `{${entries.join(",")}}`;
}

function renderRefs(refs) {
  return refs.map(r => `\u00a7\u00a0${esc(r)}`).join(" \u00b7 ");
}

// ── Acronym helpers ───────────────────────────────────────────────────────────

// Serialize acronyms dict to JS object literal for embedding in browser script.
function buildAcronymsJs(acronyms) {
  const entries = Object.entries(acronyms || {}).map(([k, v]) =>
    `"${jsStr(k)}":"${jsStr(v)}"`
  );
  return `{${entries.join(',')}}`;
}

// XML escaper used by acronym helpers (identical to svgEsc defined inside build fns).
function _xe(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Returns SVG inner content for a <text> element, wrapping all-caps acronym tokens
// in <tspan class="acro" data-def="..."> so the browser hover handler can show a
// lightweight definition tooltip.
function acroSvgInner(str, acronyms) {
  if (!acronyms || !Object.keys(acronyms).length) return _xe(str);
  const re = /\b([a-z]?[A-Z]{2,}(?:-[A-Z]{2,})*)s?\b/g;
  const parts = []; let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    const key = m[1];
    if (acronyms[key]) {
      if (m.index > last) parts.push(_xe(str.slice(last, m.index)));
      parts.push(`<tspan class="acro" data-key="${_xe(key)}" data-def="${_xe(acronyms[key])}">${_xe(m[0])}</tspan>`);
      last = m.index + m[0].length;
    }
  }
  if (last < str.length) parts.push(_xe(str.slice(last)));
  return parts.length ? parts.join('') : _xe(str);
}

// Returns HTML inner content, wrapping acronyms in <span class="acro" data-def="...">.
function acroHtmlInner(str, acronyms, escFn) {
  if (!acronyms || !Object.keys(acronyms).length) return escFn(str);
  const re = /\b([a-z]?[A-Z]{2,}(?:-[A-Z]{2,})*)s?\b/g;
  const parts = []; let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    const key = m[1];
    if (acronyms[key]) {
      if (m.index > last) parts.push(escFn(str.slice(last, m.index)));
      parts.push(`<span class="acro" data-key="${escFn(key)}" data-def="${escFn(acronyms[key])}">${escFn(m[0])}</span>`);
      last = m.index + m[0].length;
    }
  }
  if (last < str.length) parts.push(escFn(str.slice(last)));
  return parts.length ? parts.join('') : escFn(str);
}

// Scans `str` for parentheticals that contain at least one § character, then
// within each such paren finds every section-number token (major.minor) and
// returns a span for each, linked to the eCFR section URL.
// The title number is taken from the nearest preceding title reference in `str`.
function sectionLinkSpans(str) {
  const result = [];
  // Build ordered list of title-number sightings so we can ask "what title was
  // last mentioned before position P?"
  const titleRefs = [];
  const titleCtxRe = /\b(?:(\d+)\s+CFR|Title\s+(\d+))\b/g;
  let m;
  while ((m = titleCtxRe.exec(str)) !== null)
    titleRefs.push({ pos: m.index, title: m[1] || m[2] });

  function activeTitle(pos) {
    let t = null;
    for (const r of titleRefs) { if (r.pos < pos) t = r.title; else break; }
    return t;
  }

  // Find parens that contain § and mine section numbers from them
  const secParenRe = /\([^)]*§[^)]*\)/g;
  while ((m = secParenRe.exec(str)) !== null) {
    const title = activeTitle(m.index);
    if (!title) continue;
    const secNumRe = /\d+\.\d+\w*(?:\([a-z0-9]+\))?/g;
    let sm;
    while ((sm = secNumRe.exec(m[0])) !== null) {
      const absStart = m.index + sm.index;
      result.push({ start: absStart, end: absStart + sm[0].length, raw: sm[0],
        url: `https://www.ecfr.gov/current/title-${title}/section-${sm[0]}` });
    }
  }
  return result;
}

// Transforms a header string (title or subtitle) applying two kinds of markup in one pass:
//   1. CFR citations → hyperlinks to eCFR
//        "Title 47 CFR"      → title-47  (combined form, highest priority)
//        "47 CFR Part 54"    → title-47/part-54
//        "47 CFR"            → title-47
//        "Title 47"          → title-47
//        "(§§ 54.8 – 54.11)" → each section number individually linked
//   2. All-caps acronym tokens → span.acro
// Candidates are sorted by position; longer/earlier wins on overlap.
function transformHeader(str, escFn, acronyms) {
  const spans = [];
  let m;

  // ── "Title N CFR" — combined form ────────────────────────────────────────
  const titleCfrRe = /\bTitle\s+(\d+)\s+CFR\b/g;
  while ((m = titleCfrRe.exec(str)) !== null) {
    const url = `https://www.ecfr.gov/current/title-${m[1]}`;
    spans.push({ start: m.index, end: m.index + m[0].length,
      html: `<a class="cfr-link" href="${url}" target="_blank" rel="noopener noreferrer">${escFn(m[0])}</a>` });
  }

  // ── CFR "N CFR Part P" ───────────────────────────────────────────────────
  const cfrPartRe = /\b(\d+)\s+CFR\s+Parts?\s+(\d+)\b/g;
  while ((m = cfrPartRe.exec(str)) !== null) {
    const url = `https://www.ecfr.gov/current/title-${m[1]}/part-${m[2]}`;
    spans.push({ start: m.index, end: m.index + m[0].length,
      html: `<a class="cfr-link" href="${url}" target="_blank" rel="noopener noreferrer">${escFn(m[0])}</a>` });
  }

  // ── CFR "N CFR" without Part ─────────────────────────────────────────────
  const cfrOnlyRe = /\b(\d+)\s+CFR\b(?!\s+Parts?)/g;
  while ((m = cfrOnlyRe.exec(str)) !== null) {
    const url = `https://www.ecfr.gov/current/title-${m[1]}`;
    spans.push({ start: m.index, end: m.index + m[0].length,
      html: `<a class="cfr-link" href="${url}" target="_blank" rel="noopener noreferrer">${escFn(m[0])}</a>` });
  }

  // ── "Title N" ────────────────────────────────────────────────────────────
  const titleRe = /\bTitle\s+(\d+)\b/g;
  while ((m = titleRe.exec(str)) !== null) {
    const url = `https://www.ecfr.gov/current/title-${m[1]}`;
    spans.push({ start: m.index, end: m.index + m[0].length,
      html: `<a class="cfr-link" href="${url}" target="_blank" rel="noopener noreferrer">${escFn(m[0])}</a>` });
  }

  // ── § section numbers inside §-containing parens ─────────────────────────
  for (const s of sectionLinkSpans(str)) {
    const url = s.url;
    spans.push({ start: s.start, end: s.end,
      html: `<a class="cfr-link" href="${url}" target="_blank" rel="noopener noreferrer">${escFn(s.raw)}</a>` });
  }

  // ── Acronyms ─────────────────────────────────────────────────────────────
  if (acronyms && Object.keys(acronyms).length) {
    const acroRe = /\b([a-z]?[A-Z]{2,}(?:-[A-Z]{2,})*)s?\b/g;
    while ((m = acroRe.exec(str)) !== null) {
      const key = m[1];
      if (acronyms[key]) {
        spans.push({ start: m.index, end: m.index + m[0].length,
          html: `<span class="acro" data-key="${escFn(key)}" data-def="${escFn(acronyms[key])}">${escFn(m[0])}</span>` });
      }
    }
  }

  // Sort by start; on tie, longer span first; drop overlaps
  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept = []; let cursor = 0;
  for (const s of spans) { if (s.start >= cursor) { kept.push(s); cursor = s.end; } }

  let out = ''; let last = 0;
  for (const s of kept) {
    out += escFn(str.slice(last, s.start));
    out += s.html;
    last = s.end;
  }
  return out + escFn(str.slice(last));
}

// Applies CFR hyperlinks to an already-HTMLized string (e.g. instruction text that
// contains HTML entities like &#128161; or &mdash;).  Works by splitting on tag
// boundaries and only processing text segments, so existing markup is untouched
// and there is no risk of double-escaping entities.
function linkCfrInHtml(html) {
  function applyLinks(text) {
    const spans = [];
    let m;
    const CFR_TITLE = /\bTitle\s+(\d+)\s+CFR\b/g;
    const CFR_PART  = /\b(\d+)\s+CFR\s+Parts?\s+(\d+)\b/g;
    const CFR_ONLY  = /\b(\d+)\s+CFR\b(?!\s+Parts?)/g;
    const TITLE_NUM = /\bTitle\s+(\d+)\b/g;
    while ((m = CFR_TITLE.exec(text)) !== null)
      spans.push({ start: m.index, end: m.index + m[0].length, raw: m[0],
        url: `https://www.ecfr.gov/current/title-${m[1]}` });
    while ((m = CFR_PART.exec(text))  !== null)
      spans.push({ start: m.index, end: m.index + m[0].length, raw: m[0],
        url: `https://www.ecfr.gov/current/title-${m[1]}/part-${m[2]}` });
    while ((m = CFR_ONLY.exec(text))  !== null)
      spans.push({ start: m.index, end: m.index + m[0].length, raw: m[0],
        url: `https://www.ecfr.gov/current/title-${m[1]}` });
    while ((m = TITLE_NUM.exec(text)) !== null)
      spans.push({ start: m.index, end: m.index + m[0].length, raw: m[0],
        url: `https://www.ecfr.gov/current/title-${m[1]}` });
    for (const s of sectionLinkSpans(text))
      spans.push(s);
    if (!spans.length) return text;
    spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const kept = []; let cursor = 0;
    for (const s of spans) { if (s.start >= cursor) { kept.push(s); cursor = s.end; } }
    let out = ''; let last = 0;
    for (const s of kept) {
      out += text.slice(last, s.start);
      out += `<a class="cfr-link" href="${s.url}" target="_blank" rel="noopener noreferrer">${s.raw}</a>`;
      last = s.end;
    }
    return out + text.slice(last);
  }

  // Split on HTML tags; only transform text segments (even-indexed parts)
  return html.split(/(<[^>]*>)/).map((seg, i) => i % 2 === 0 ? applyLinks(seg) : seg).join('');
}


// which runs after the SVG is rendered to mark text nodes containing acronyms.
function acroMermaidSetupJs() {
  return `var _acroDict=${buildAcronymsJs(effectiveAcronyms)};
var _acroRe=/\\b([a-z]?[A-Z]{2,}(?:-[A-Z]{2,})*)s?\\b/g;
function _markAcros(svgEl){
  var w=document.createTreeWalker(svgEl,NodeFilter.SHOW_TEXT,null,false);
  var nd;var seen=new Set();
  while((nd=w.nextNode())){
    var v=nd.nodeValue||'';var defs=[],mm;_acroRe.lastIndex=0;
    while((mm=_acroRe.exec(v))!==null){
      var k=mm[1];
      if(_acroDict[k]&&!defs.some(function(d){return d[0]===k;}))defs.push([k,_acroDict[k]]);
    }
    if(!defs.length)continue;
    var el=nd.parentElement;if(!el||seen.has(el))continue;
    seen.add(el);el.setAttribute('data-acro-defs',JSON.stringify(defs));
  }
}`;
}

// ── Shared constants ──────────────────────────────────────────────────────────

const title       = config.title       || "CFR Regulatory Timeline";
const subtitle    = config.subtitle    || "";
const borderColor = config.borderColor || "#0e7490";

// ── Built-in regulatory acronyms (always available; user entries take precedence) ──
const BUILTIN_ACRONYMS = {
  "CFR":   "Code of Federal Regulations",
  "eCFR":  "Electronic Code of Federal Regulations",
  "USC":   "United States Code",
  "FR":    "Federal Register",
  "OMB":   "Office of Management and Budget",
  "GAO":   "Government Accountability Office",
  "FCC":   "Federal Communications Commission",
  "USAC":  "Universal Service Administrative Company",
  "USF":   "Universal Service Fund",
  "FTC":   "Federal Trade Commission",
  "DOJ":   "Department of Justice",
  "USPS":  "United States Postal Service",
  "iOS":   "Apple mobile operating system",
};
const effectiveAcronyms = Object.assign({}, BUILTIN_ACRONYMS, config.acronyms || {});

// ── Shared tooltip CSS ────────────────────────────────────────────────────────

const tooltipCss = `
#tt{display:none;position:fixed;z-index:9999;background:#0f172a;color:#e2e8f0;
  border-radius:10px;padding:14px 18px;max-width:500px;min-width:260px;
  font-size:.82rem;line-height:1.55;box-shadow:0 8px 30px rgba(0,0,0,.35);
  pointer-events:auto;user-select:text}
#tt .th{font-weight:700;color:#38bdf8;margin-bottom:8px;font-size:.88rem;
  border-bottom:1px solid #334155;padding-bottom:6px;
  display:flex;justify-content:space-between;align-items:center;gap:12px}
#tt .close-btn{cursor:pointer;color:#94a3b8;font-size:1.1rem;
  padding:0 2px;border:none;background:none;line-height:1;flex-shrink:0}
#tt .close-btn:hover{color:#fff}
#tt .ts{margin-bottom:10px}
#tt .ts:last-child{margin-bottom:0}
#tt .tr{font-weight:600;color:#7dd3fc}
#tt .tx{color:#cbd5e1;margin-top:2px}
#tt .tl-period{color:#a5f3fc;font-weight:700;font-size:.85rem}
#tt .tn{color:#fde68a;font-style:italic;line-height:1.6}
#tt .tb{max-height:75vh;overflow-y:auto;overscroll-behavior:contain}
#tt .tb::-webkit-scrollbar{width:5px}
#tt .tb::-webkit-scrollbar-track{background:transparent}
#tt .tb::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
#acro-tip{display:none;position:fixed;z-index:10000;background:#1e293b;color:#f1f5f9;
  border-radius:6px;padding:6px 12px;font-size:.78rem;line-height:1.5;
  pointer-events:none;max-width:300px;box-shadow:0 4px 14px rgba(0,0,0,.3)}
#acro-tip b{color:#7dd3fc;font-weight:700}
a.cfr-link{color:inherit;text-decoration:underline dotted currentColor;text-underline-offset:2px;cursor:pointer}
a.cfr-link:hover{text-decoration:underline currentColor}`.trim();

// ── Shared tooltip JS ─────────────────────────────────────────────────────────

const tooltipJs = `
var defined=${buildDefined(config.defined)};
var _acroDict=${buildAcronymsJs(effectiveAcronyms)};
var tip=document.getElementById('tt');
var th=tip.querySelector('.th');
var tb=tip.querySelector('.tb');
var activeItem=null;
function _acroWrap(s){
  if(!s)return s;
  var re=/\\b([a-z]?[A-Z]{2,}(?:-[A-Z]{2,})*)s?\\b/g,out='',last=0,m;
  function xe(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  while((m=re.exec(s))!==null){
    var k=m[1];
    if(_acroDict[k]){
      out+=xe(s.slice(last,m.index));
      out+='<span class="acro" data-key="'+xe(k)+'" data-def="'+xe(_acroDict[k])+'">'+xe(m[0])+'</span>';
      last=m.index+m[0].length;
    }
  }
  out+=xe(s.slice(last));
  return out;
}
function show(refs,label,ev){
  var h='';
  refs.forEach(function(k){
    var d=defined[k];
    if(d)h+='<div class="ts"><div class="tr">\\u00a7 '+k+' \\u2014 '+_acroWrap(d[0])+'</div><div class="tx">'+_acroWrap(d[1])+'</div></div>';
  });
  if(!h)return;
  th.innerHTML='<span>'+label+'</span><button class="close-btn" title="Close">\\u00d7</button>';
  tip.querySelector('.close-btn').addEventListener('click',function(e){e.stopPropagation();hide();});
  tb.innerHTML=h;tip.style.display='block';activeItem=label;pos(ev);
}
function showAnnotation(text,name,color,ev){
  if(!text)return;
  th.innerHTML='<span style="color:'+color+'">'+name+'</span><button class="close-btn" title="Close">\\u00d7</button>';
  tip.querySelector('.close-btn').addEventListener('click',function(e){e.stopPropagation();hide();});
  tb.innerHTML='<div class="tn">'+_acroWrap(text)+'</div>';
  tip.style.display='block';activeItem=name+'__annotation';pos(ev);
}
function pos(ev){
  var p=16,w=tip.offsetWidth,h=tip.offsetHeight,x=ev.clientX+p,y=ev.clientY+p;
  if(x+w>window.innerWidth-p)x=ev.clientX-w-p;
  if(y+h>window.innerHeight-p)y=ev.clientY-h-p;
  if(x<p)x=p;if(y<p)y=p;
  tip.style.left=x+'px';tip.style.top=y+'px';
}
function hide(){tip.style.display='none';activeItem=null;}
document.addEventListener('click',function(e){if(!tip.contains(e.target))hide();});
var _acroTip=document.getElementById('acro-tip');
function _acroPos(e){
  var p=12,w=_acroTip.offsetWidth,h=_acroTip.offsetHeight;
  var x=e.clientX+p,y=e.clientY-h-8;
  if(x+w>window.innerWidth-p)x=e.clientX-w-p;
  if(y<p)y=e.clientY+p;
  _acroTip.style.left=x+'px';_acroTip.style.top=y+'px';
}
var _lastAcroEl=null;
document.addEventListener('mousemove',function(e){
  var el=e.target;
  /* Peek through transparent overlay rects (lc-click etc.) */
  var hidden=null;
  if(el.tagName==='rect'||el.tagName==='RECT'){
    var pe=el.style.pointerEvents||el.getAttribute('pointer-events')||'';
    if(el.getAttribute('opacity')==='0'||pe==='none'||el.style.opacity==='0'){
      hidden=el;el.style.pointerEvents='none';
      el=document.elementFromPoint(e.clientX,e.clientY)||el;
    } else if(window.getComputedStyle(el).opacity==='0'){
      hidden=el;el.style.pointerEvents='none';
      el=document.elementFromPoint(e.clientX,e.clientY)||el;
    }
    if(hidden)hidden.style.pointerEvents='';
  }
  /* Check if el or any ancestor is an acro span/tspan */
  var found=null,cur=el;
  for(var i=0;i<6&&cur&&cur!==document.body;i++){
    if(cur.classList&&cur.classList.contains('acro')){found=cur;break;}
    if(cur.getAttribute&&cur.getAttribute('data-acro-defs')){found=cur;break;}
    cur=cur.parentElement;
  }
  if(found===_lastAcroEl&&_acroTip.style.display!=='none'){
    _acroPos(e);return;
  }
  if(!found){_acroTip.style.display='none';_lastAcroEl=null;return;}
  _lastAcroEl=found;
  if(found.classList&&found.classList.contains('acro')){
    var def=found.getAttribute('data-def');
    if(!def){_acroTip.style.display='none';return;}
    _acroTip.innerHTML='<b>'+(found.getAttribute('data-key')||found.textContent)+'</b> \u2014 '+def;
  } else {
    var defs=found.getAttribute('data-acro-defs');
    try{
      var arr=JSON.parse(defs);
      _acroTip.innerHTML=arr.map(function(d){return '<b>'+d[0]+'</b> \u2014 '+d[1];}).join('<br>');
    }catch(ex){_acroTip.style.display='none';return;}
  }
  _acroTip.style.display='block';_acroPos(e);
});`.trim();

// ── Shared page header HTML ───────────────────────────────────────────────────

const headerHtml = `<h1>${transformHeader(title, esc, effectiveAcronyms)}</h1>
${subtitle ? `<p class="subtitle">${transformHeader(subtitle, esc, effectiveAcronyms)}</p>` : ""}
<div class="instr-wrap"><div class="instr">${linkCfrInHtml('&#128161; Click any item to see the relevant regulatory text from Title 47 CFR &mdash; text is selectable for copying')}</div></div>
<div id="acro-tip"></div>
<div id="tt"><div class="th"></div><div class="tb"></div></div>`;

// ════════════════════════════════════════════════════════════════════════════
// VERTICAL LAYOUT
// ════════════════════════════════════════════════════════════════════════════

function buildEvents() {
  let totalEvents = 0;
  const allRefs = new Set();
  for (const sec of config.sections) {
    for (const ev of (sec.events || [])) {
      totalEvents++;
      for (const r of (ev.refs || [])) allRefs.add(r);
    }
  }

  const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f4f8;color:#1e293b;padding:16px}
h1{text-align:center;font-size:1.4rem;margin-bottom:4px;color:#0f172a}
.subtitle{text-align:center;font-size:.85rem;color:#64748b;margin-bottom:6px}
.instr-wrap{text-align:center;margin-bottom:20px}
.instr{font-size:.8rem;color:#0369a1;background:#e0f2fe;padding:8px 16px;border-radius:8px;display:inline-block}
.era{background:#fff;border-radius:12px;margin-bottom:16px;padding:16px 20px;
  box-shadow:0 1px 6px rgba(0,0,0,.07);border-left:5px solid ${borderColor}}
.era-label{font-size:.9rem;font-weight:700;color:${borderColor};margin-bottom:14px;
  padding-bottom:8px;border-bottom:1px solid #e2e8f0;letter-spacing:.02em;text-transform:uppercase}
.events{position:relative;padding-left:88px}
.events::before{content:'';position:absolute;left:56px;top:0;bottom:0;width:2px;background:#e2e8f0}
.event{position:relative;margin-bottom:20px;cursor:pointer;padding:2px 0}
.event:last-child{margin-bottom:0}
.event::before{content:'';position:absolute;left:-38px;width:12px;height:12px;border-radius:50%;
  background:${borderColor};top:4px;box-shadow:0 0 0 3px #fff,0 0 0 5px ${borderColor};
  transition:background .15s,box-shadow .15s}
.event:hover::before{background:#0f172a;box-shadow:0 0 0 3px #fff,0 0 0 5px #0f172a}
.year{position:absolute;left:-88px;width:44px;text-align:right;
  font-size:.75rem;font-weight:700;color:#94a3b8;top:5px;line-height:1}
.event-label{font-size:.88rem;font-weight:600;color:#1e293b;line-height:1.4;transition:color .15s}
.event:hover .event-label{color:${borderColor}}
.event-refs{font-size:.75rem;color:#64748b;margin-top:4px;opacity:.72;line-height:1.4}
${tooltipCss}`.trim();

  let sectionsHtml = "";
  for (const sec of config.sections) {
    let eventsHtml = "";
    for (const ev of (sec.events || [])) {
      const refs     = ev.refs || [];
      const refsJson = esc(JSON.stringify(refs));
      const labelEsc = esc(ev.label || "");
      eventsHtml += `
      <div class="event" data-refs="${refsJson}" data-label="${labelEsc}">
        <span class="year">${esc(ev.year || "")}</span>
        <div class="event-label">${labelEsc}</div>
        ${refs.length ? `<div class="event-refs">${renderRefs(refs)}</div>` : ""}
      </div>`;
    }
    sectionsHtml += `
    <div class="era">
      <div class="era-label">${acroHtmlInner(sec.label || "", effectiveAcronyms, esc)}</div>
      <div class="events">${eventsHtml}
      </div>
    </div>`;
  }

  const js = `${tooltipJs}
document.querySelectorAll('.event').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var refs=JSON.parse(el.dataset.refs);
    var label=el.dataset.label;
    if(activeItem===label){hide();}else{show(refs,label,e);}
  });
});`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)} - 47 CFR References</title>
<style>${css}</style></head>
<body>
${headerHtml}
<div class="timeline">${sectionsHtml}
</div>
<script>${js}<\/script>
</body></html>`;

  fs.writeFileSync(outputPath, html, "utf-8");
  console.log(`\u2713 Generated: ${outputPath}`);
  console.log(`  Layout:    events`);
  console.log(`  Sections:  ${config.sections.length}`);
  console.log(`  Events:    ${totalEvents}`);
  console.log(`  CFR refs:  ${allRefs.size}`);
}

// ════════════════════════════════════════════════════════════════════════════
// HORIZONTAL LAYOUT
// ════════════════════════════════════════════════════════════════════════════

function buildTimeline() {
  const periods     = config.periods;
  const markers     = config.markers || [];   // vertical event lines + callouts
  const currentYear = new Date().getFullYear();

  // Determine axis range — extend to accommodate any markers outside period range
  const minYear = Math.min(...periods.map(p => p.start), ...markers.map(m => m.year));
  const maxYear = Math.max(...periods.map(p => p.end || currentYear), ...markers.map(m => m.year));
  const span    = maxYear - minYear;

  // Stats
  const allRefs = new Set();
  for (const p of periods) for (const r of (p.refs || [])) allRefs.add(r);

  // Generate clean tick years
  function axisTicks(min, max) {
    const range = max - min;
    const step  = range <= 20 ? 2 : range <= 40 ? 5 : range <= 80 ? 10 : 20;
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let y = start; y <= max; y += step) ticks.push(y);
    return ticks;
  }
  const ticks = axisTicks(minYear, maxYear);

  // Convert year to percentage along the chart area
  function pct(year) {
    return ((year - minYear) / span * 100).toFixed(3) + "%";
  }

  // ── Axis tick marks ──────────────────────────────────────────────────────
  let ticksHtml = "";
  for (const t of ticks) {
    ticksHtml += `<div class="tick" style="left:${pct(t)}">
      <div class="tick-line"></div>
      <div class="tick-label">${t}</div>
    </div>\n`;
  }

  // ── Vertical marker lines (body) + callout boxes (header row above rows) ──
  // Each marker: { year, label, sublabel? }
  let markerLinesHtml = "";  // dashed lines — rendered inside chart-body
  let markerCallsHtml = "";  // callout boxes — rendered in header row above rows
  for (const m of markers) {
    const mRefs   = m.refs || [];
    const mRefsJ  = esc(JSON.stringify(mRefs));
    const mLblEsc = esc(m.label || "");
    const mClick  = mRefs.length > 0;
    markerLinesHtml += `<div class="mline" style="left:${pct(m.year)}"></div>\n`;
    markerCallsHtml += `<div class="mcallout${mClick ? " mc-clickable" : ""}"
      style="left:${pct(m.year)}"
      ${mClick ? `data-refs="${mRefsJ}" data-label="${mLblEsc}"` : ""}>
      <div class="mcallout-label">${acroHtmlInner(m.label || "", effectiveAcronyms, esc)}</div>
      ${m.sublabel ? `<div class="mcallout-sub">${esc(m.sublabel)}</div>` : ""}
      ${mRefs.length ? `<div class="mcallout-refs">${renderRefs(mRefs)}</div>` : ""}
    </div>\n`;
  }

  // ── Program rows ─────────────────────────────────────────────────────────
  let rowsHtml = "";
  for (const prog of periods) {
    const refs      = prog.refs || [];
    const refsJson  = esc(JSON.stringify(refs));
    const labelEsc  = esc(prog.label || "");
    const color     = prog.color || borderColor;
    const startPct  = pct(prog.start);
    const endYear   = prog.end || currentYear;
    const widthPct  = ((endYear - prog.start) / span * 100).toFixed(3) + "%";
    const ongoing   = !prog.end;
    const pilot     = !!prog.pilot;
    const yearRange = ongoing
      ? `${prog.start}\u2013present`
      : `${prog.start}\u2013${prog.end}`;

    // Gradient: derive a lighter shade for right side by appending "cc" (80% opacity overlay)
    const gradId    = "g" + Math.abs(prog.label.split("").reduce((a,c)=>a+c.charCodeAt(0),0));
    const gradStyle = `background:linear-gradient(90deg,${color},${color}bb)`;

    // Sub-milestone dots
    const milestones = prog.milestones || [];
    let milestonesHtml = "";
    for (const ms of milestones) {
      const msRefs    = ms.refs || [];
      const msRefsJ   = esc(JSON.stringify(msRefs));
      const msLblEsc  = esc(ms.label || "");
      const clickable = msRefs.length > 0;
      milestonesHtml += `<div class="ms-dot${clickable ? " ms-clickable" : ""}"
           style="left:${pct(ms.year)}"
           ${clickable ? `data-refs="${msRefsJ}" data-label="${msLblEsc}" data-year="${ms.year}"` : ""}>
        <div class="ms-dot-mark"></div>
        <div class="ms-label">${msLblEsc}${msRefs.length ? `<span class="ms-ref-inline"> ${renderRefs(msRefs)}</span>` : ""}</div>
        <div class="ms-year">${esc(String(ms.year))}</div>
      </div>`;
    }

    // Bar classes
    const barClasses = ["prog-bar", ongoing ? "ongoing" : "", pilot ? "pilot" : ""]
      .filter(Boolean).join(" ");

    rowsHtml += `
    <div class="prog-row">
      <div class="prog-name${prog.citation ? ' tl-clickable' : ''}"
           title="${labelEsc}"
           data-citation="${esc(prog.citation || '')}"
           data-label="${labelEsc}">${acroHtmlInner(prog.label || "", effectiveAcronyms, esc)}${prog.citation ? `<div class="prog-name-refs">${esc(prog.citation)}</div>` : ""}</div>
      <div class="prog-chart">
        <div class="${barClasses}"
             style="left:${startPct};width:${widthPct};${gradStyle}"
             data-refs="${refsJson}" data-label="${labelEsc}"
             data-start="${prog.start}" data-end="${prog.end || ''}" data-ongoing="${ongoing}">
          <span class="bar-range">${esc(yearRange)}</span>
          ${refs.length ? `<span class="bar-refs">${renderRefs(refs)}</span>` : ""}
        </div>
        ${milestonesHtml}
      </div>
    </div>`;
  }

  const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f4f8;color:#1e293b;padding:16px}
h1{text-align:center;font-size:1.4rem;margin-bottom:4px;color:#0f172a}
.subtitle{text-align:center;font-size:.85rem;color:#64748b;margin-bottom:6px}
.instr-wrap{text-align:center;margin-bottom:20px}
.instr{font-size:.8rem;color:#0369a1;background:#e0f2fe;padding:8px 16px;border-radius:8px;display:inline-block}

/* Outer card */
.hchart{background:#fff;border-radius:12px;padding:20px 24px 24px;
  box-shadow:0 1px 6px rgba(0,0,0,.07);border-left:5px solid ${borderColor};
  overflow-x:auto;min-width:0}

/* Axis row */
.axis-row{display:flex;align-items:flex-end;margin-bottom:0}
.axis-spacer{flex:0 0 200px;padding-right:16px}
.axis-wrap{flex:1;position:relative;height:30px;border-bottom:2px solid #e2e8f0}
.tick{position:absolute;transform:translateX(-50%)}
.tick-line{width:1px;height:6px;background:#cbd5e1;margin:0 auto}
.tick-label{font-size:.7rem;color:#94a3b8;margin-top:2px;white-space:nowrap;text-align:center}

/* Chart body — wraps marker lines + all rows */
.chart-body{display:flex;flex-direction:column;gap:0;position:relative}

/* Marker header row (callout boxes above chart rows) */
.markers-header{display:flex;align-items:flex-end;margin-bottom:4px}
.markers-wrap{flex:1;position:relative;height:38px}
.mcallout{position:absolute;transform:translateX(-50%);background:#f8fafc;
  border:1px solid #e2e8f0;border-radius:4px;padding:3px 7px;white-space:nowrap;
  box-shadow:0 1px 4px rgba(0,0,0,.07);bottom:0}
.mcallout-label{font-size:.72rem;font-weight:700;color:#334155}
.mcallout-sub{font-size:.65rem;color:#94a3b8;margin-top:1px}
.mcallout-refs{font-size:.62rem;color:#94a3b8;margin-top:2px;opacity:.8}
.mc-clickable{cursor:pointer;pointer-events:auto}
.mc-clickable:hover{background:#eff6ff;border-color:#bfdbfe}
.mc-clickable:hover .mcallout-label{color:#1d4ed8}

/* Vertical marker lines (inside chart-body) */
.mline{position:absolute;top:0;bottom:0;width:1px;border-left:1px dashed #cbd5e1;
  pointer-events:none;z-index:1}

/* Program rows */
.prog-row{display:flex;align-items:center;margin-bottom:18px;position:relative;z-index:2}
.prog-row:last-child{margin-bottom:0}
.prog-name{flex:0 0 200px;font-size:.82rem;font-weight:600;color:#334155;
  padding-right:16px;line-height:1.3;text-align:right;word-break:break-word}
.prog-name.tl-clickable{cursor:pointer}
.prog-name.tl-clickable:hover{color:${borderColor}}
.prog-name.tl-clickable:hover .prog-name-refs{opacity:1}
.prog-name-refs{font-size:.7rem;font-weight:400;color:#94a3b8;margin-top:3px;opacity:.72;line-height:1.3}
.prog-chart{flex:1;position:relative;height:60px}

/* Bar */
.prog-bar{position:absolute;top:4px;height:32px;border-radius:6px;
  display:flex;align-items:center;padding:0 10px;
  cursor:pointer;transition:filter .15s,box-shadow .15s;
  box-shadow:0 2px 6px rgba(0,0,0,.2);min-width:4px;overflow:hidden}
.prog-bar:hover{filter:brightness(1.1);box-shadow:0 4px 14px rgba(0,0,0,.3)}
.prog-bar.ongoing{border-right:3px dashed rgba(255,255,255,.55);border-radius:6px 3px 3px 6px}

/* Diagonal stripe overlay for pilot programs */
.prog-bar.pilot::after{content:'';position:absolute;inset:0;
  background:repeating-linear-gradient(
    45deg,
    transparent,
    transparent 4px,
    rgba(255,255,255,0.15) 4px,
    rgba(255,255,255,0.15) 8px
  );pointer-events:none;border-radius:inherit}

/* Bar text */
.prog-bar{flex-direction:column;justify-content:center}
.bar-range{font-size:.72rem;font-weight:700;color:rgba(255,255,255,.95);
  white-space:nowrap;line-height:1.2;overflow:hidden;text-overflow:ellipsis;position:relative;z-index:1}
.bar-refs{font-size:.67rem;color:rgba(255,255,255,.62);white-space:nowrap;
  margin-top:1px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;position:relative;z-index:1}

/* Sub-milestone dots */
.ms-dot{position:absolute;top:36px;transform:translateX(-50%);
  display:flex;flex-direction:column;align-items:center;pointer-events:none}
.ms-dot.ms-clickable{pointer-events:auto;cursor:pointer}
.ms-dot.ms-clickable:hover .ms-dot-mark{background:#0f172a;box-shadow:0 0 0 2px #fff,0 0 0 3px #0f172a}
.ms-dot.ms-clickable:hover .ms-label{color:${borderColor}}
.ms-dot-mark{width:6px;height:6px;border-radius:50%;background:${borderColor};
  box-shadow:0 0 0 2px #fff,0 0 0 3px ${borderColor};transition:background .15s,box-shadow .15s}
.ms-label{font-size:.62rem;color:#64748b;white-space:nowrap;margin-top:3px;text-align:center;transition:color .15s}
.ms-ref-inline{font-size:.58rem;color:#94a3b8;opacity:.8}
.ms-year{font-size:.6rem;color:#94a3b8;white-space:nowrap;text-align:center}

${tooltipCss}`.trim();

  const js = `${tooltipJs}
function showTl(refs,label,period,ev){
  var h='<div class="ts"><div class="tr">Period</div><div class="tx tl-period">'+period+'</div></div>';
  refs.forEach(function(k){
    var d=defined[k];
    if(d)h+='<div class="ts"><div class="tr">\\u00a7 '+k+' \\u2014 '+d[0]+'</div><div class="tx">'+d[1]+'</div></div>';
  });
  th.innerHTML='<span>'+label+'</span><button class="close-btn" title="Close">\\u00d7</button>';
  tip.querySelector('.close-btn').addEventListener('click',function(e){e.stopPropagation();hide();});
  tb.innerHTML=h;tip.style.display='block';activeItem=label;pos(ev);
}
document.querySelectorAll('.prog-name.tl-clickable').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var citation=el.dataset.citation;
    var label=el.dataset.label;
    if(!citation)return;
    if(activeItem===label+':name'){hide();return;}
    var key=citation.replace('47 CFR \\u00a7 ','').replace('47 CFR \\u00a7','').trim();
    var d=defined[key];
    var h=d
      ? '<div class="ts"><div class="tr">\\u00a7 '+key+' \\u2014 '+d[0]+'</div><div class="tx">'+d[1]+'</div></div>'
      : '<div class="ts"><div class="tx">'+citation+'</div></div>';
    th.innerHTML='<span>'+label+'</span><button class="close-btn" title="Close">\\u00d7</button>';
    tip.querySelector('.close-btn').addEventListener('click',function(e){e.stopPropagation();hide();});
    tb.innerHTML=h;tip.style.display='block';activeItem=label+':name';pos(e);
  });
});
document.querySelectorAll('.mcallout.mc-clickable').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var refs=JSON.parse(el.dataset.refs);
    var label=el.dataset.label;
    if(activeItem===label+':mc'){hide();return;}
    var h='';
    refs.forEach(function(k){
      var d=defined[k];
      if(d)h+='<div class="ts"><div class="tr">\u00a7 '+k+' \u2014 '+d[0]+'</div><div class="tx">'+d[1]+'</div></div>';
    });
    if(!h)return;
    th.innerHTML='<span>'+label+'</span><button class="close-btn" title="Close">\u00d7</button>';
    tip.querySelector('.close-btn').addEventListener('click',function(e){e.stopPropagation();hide();});
    tb.innerHTML=h;tip.style.display='block';activeItem=label+':mc';pos(e);
  });
});
document.querySelectorAll('.ms-dot.ms-clickable').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var refs=JSON.parse(el.dataset.refs);
    var label=el.dataset.label+' ('+el.dataset.year+')';
    if(activeItem===label){hide();}else{show(refs,label,e);}
  });
});
document.querySelectorAll('.prog-bar').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var refs=JSON.parse(el.dataset.refs);
    var label=el.dataset.label;
    var start=el.dataset.start;
    var end=el.dataset.end;
    var ongoing=el.dataset.ongoing==='true';
    var period=start+(ongoing?' \\u2013 present':end?' \\u2013 '+end:'');
    if(activeItem===label){hide();}else{showTl(refs,label,period,e);}
  });
});`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)} - 47 CFR References</title>
<style>${css}</style></head>
<body>
${headerHtml}
<div class="hchart">
  <div class="axis-row">
    <div class="axis-spacer"></div>
    <div class="axis-wrap">${ticksHtml}</div>
  </div>
  ${markers.length ? `<div class="markers-header">
    <div class="axis-spacer"></div>
    <div class="markers-wrap">${markerCallsHtml}</div>
  </div>` : ""}
  <div class="chart-body" style="position:relative;margin-top:4px">
    ${markerLinesHtml}
    ${rowsHtml}
  </div>
</div>
<script>${js}<\/script>
</body></html>`;

  fs.writeFileSync(outputPath, html, "utf-8");
  console.log(`\u2713 Generated: ${outputPath}`);
  console.log(`  Layout:    timeline`);
  console.log(`  Periods:   ${periods.length}`);
  console.log(`  Markers:   ${markers.length}`);
  console.log(`  Axis:      ${minYear} \u2013 ${maxYear}`);
  console.log(`  CFR refs:  ${allRefs.size}`);
}


// ── Shared label helpers for lifecycle / lifecycle-t ────────────────────────

// Returns true if refKey exactly matches any key in the set, OR if the set
// contains a more specific key that starts with refKey + "(" (e.g. "54.7"
// matches "54.7(a)"). Also resolves to an array of matching defined keys.
function refMatchesSet(refKey, keySet) {
  if (keySet.has(refKey)) return true;
  const prefix = refKey + '(';
  for (const k of keySet) { if (k.startsWith(prefix)) return true; }
  return false;
}
function resolveRefInDefined(refKey, defined) {
  if (defined[refKey]) return [refKey];
  const prefix = refKey + '(';
  return Object.keys(defined).filter(k => k.startsWith(prefix));
}

// Parse a label string into segments: plain text and § ref parts.
// Each part: { text, refKey }  where refKey is null for plain text.
function parseLabelParts(label) {
  const parts = [];
  const pat = /(\u00a7[\u00a0 ]?)([\d.]+(?:\([^)]*\))*)/g;
  let last = 0, m;
  while ((m = pat.exec(label)) !== null) {
    if (m.index > last) parts.push({ text: label.slice(last, m.index), refKey: null });
    parts.push({ text: m[1] + m[2], refKey: m[2] });
    last = m.index + m[0].length;
  }
  if (last < label.length) parts.push({ text: label.slice(last), refKey: null });
  return parts;
}

// Return visible plain text of a label after omitting suppressed ref segments.
function labelVisibleText(label, suppressedRefs) {
  return parseLabelParts(label)
    .filter(p => !p.refKey || !suppressedRefs.has(p.refKey))
    .map(p => p.text).join('').trim();
}

// Render label as SVG inner content. Suppressed refs are omitted; remaining refs
// get the muted italic tspan style matching cell card ref lines.
// xe() is a minimal XML escaper so this function can live at module scope
// without depending on the svgEsc helper defined inside each build function.
function labelInnerSvg(label, suppressedRefs, acronyms) {
  function xe(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  // Wrap all-caps acronym tokens in tspan.acro within a plain text segment.
  function acroInner(str) {
    if (!acronyms || !Object.keys(acronyms).length) return xe(str);
    const re = /\b([a-z]?[A-Z]{2,}(?:-[A-Z]{2,})*)s?\b/g;
    const ps = []; let last = 0, m;
    while ((m = re.exec(str)) !== null) {
      const k = m[1];
      if (acronyms[k]) {
        if (m.index > last) ps.push(xe(str.slice(last, m.index)));
        ps.push('<tspan class="acro" data-key="' + xe(k) + '" data-def="' + xe(acronyms[k]) + '">' + xe(m[0]) + '</tspan>');
        last = m.index + m[0].length;
      }
    }
    if (last < str.length) ps.push(xe(str.slice(last)));
    return ps.length ? ps.join('') : xe(str);
  }
  suppressedRefs = suppressedRefs || new Set();
  const parts = parseLabelParts(label).filter(p => !p.refKey || !suppressedRefs.has(p.refKey));
  if (parts.every(p => !p.refKey)) return acroInner(parts.map(p => p.text).join('').trim());
  return parts.map(p =>
    p.refKey
      ? '<tspan fill="#94a3b8" font-style="italic" font-weight="400">' + xe(p.text) + '</tspan>'
      : '<tspan>' + acroInner(p.text) + '</tspan>'
  ).join('');
}

// Render a refs array as SVG tspan content.
// Refs present in `defined` use definedFill (muted gray); others use
// undefinedFill (faded red) to signal the section is cited but not yet
// wired to a tooltip definition.
function refsInnerSvg(refs, defined, definedFill, undefinedFill) {
  function xe(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  return refs.map(function(r, i) {
    const fill = defined[r] ? definedFill : undefinedFill;
    const sep  = i > 0 ? '<tspan fill="' + xe(definedFill) + '"> \u00b7 </tspan>' : '';
    return sep + '<tspan fill="' + xe(fill) + '">\u00a7\u00a0' + xe(r) + '</tspan>';
  }).join('');
}

// ════════════════════════════════════════════════════════════════════════════
// LABEL PLACEMENT — inline browser script using getBBox + getPointAtLength
// Shared by buildLifecycle and buildLifecycleT.
// The generator emits <text id="conn-label-N" opacity="0"> stubs and
// <path id="conn-path-N" data-label-near data-curved> elements.
// This script runs after DOMContentLoaded, measures actual rendered text via
// getBBox(), samples paths via getPointAtLength(), scores candidates against
// cards and other paths, then repositions each text and inserts its <rect>.
// ════════════════════════════════════════════════════════════════════════════
function lcLabelPlacementScript() {
  return `
(function(){
'use strict';

/* ── path sampling ─────────────────────────────────────────────────── */
function samplePath(el, n) {
  var len = el.getTotalLength();
  if (!len) return [];
  var pts = [];
  for (var i = 0; i <= n; i++) {
    var pt = el.getPointAtLength(len * i / n);
    pts.push({x: pt.x, y: pt.y});
  }
  return pts;
}

/* ── candidate generation ───────────────────────────────────────────── */
function candidates(pathEl, labelNear, tw, th) {
  var len = pathEl.getTotalLength();
  if (len < 4) return [];
  var GAP        = th / 2 + 25;   // px from endpoint to nearest label edge
  var NUDGE      = th / 2 + 5;    // perpendicular distance from path centre
  var SHORT_LINE = 120;            // threshold below which horizontal lines get extra gap
  var NUDGE_H    = len < SHORT_LINE ? NUDGE + 5 : NUDGE;  // extra 5px on short horiz segments
  var cands = [];

  /* find arc-length positions that are >= GAP from each endpoint */
  var lStart = 0, lEnd = len;
  var N = 128;
  var startPt = pathEl.getPointAtLength(0);
  var endPt   = pathEl.getPointAtLength(len);
  for (var i = 1; i <= N; i++) {
    var d = i * len / N;
    var p = pathEl.getPointAtLength(d);
    var dx = p.x - startPt.x, dy = p.y - startPt.y;
    if (Math.sqrt(dx*dx+dy*dy) >= GAP) { lStart = d; break; }
  }
  for (var i = 1; i <= N; i++) {
    var d = len - i * len / N;
    var p = pathEl.getPointAtLength(d);
    var dx = p.x - endPt.x, dy = p.y - endPt.y;
    if (Math.sqrt(dx*dx+dy*dy) >= GAP) { lEnd = d; break; }
  }
  if (lStart > lEnd) { var tmp = lStart; lStart = lEnd; lEnd = tmp; }

  /* pick sample arc-length positions based on labelNear */
  var mid = (lStart + lEnd) / 2;
  var samples;
  if (labelNear === 'start') {
    samples = [lStart, (lStart + mid) / 2];
  } else if (labelNear === 'end') {
    samples = [lEnd, (lEnd + mid) / 2];
  } else if (len > 250) {
    /* Dense uniform sweep for long arrows that may pass through intermediate
     * boxes — gives the scorer enough resolution to find clear gap segments. */
    var N_SAMP = 24;
    samples = [];
    for (var si2 = 0; si2 <= N_SAMP; si2++) {
      samples.push(lStart + si2 * (lEnd - lStart) / N_SAMP);
    }
  } else {
    /* Short / adjacent-box connections: original 5-point set works well. */
    samples = [mid, (mid + lStart) / 2, (mid + lEnd) / 2,
               (lStart * 3 + lEnd) / 4, (lStart + lEnd * 3) / 4];
  }

  /* for each sample, emit candidates based on path orientation at that point.
   * Strategy:
   *   - Primarily VERTICAL tangent → one candidate centred ON the line (cx=pt.x),
   *     plus two side fallbacks; avoids left/right bias between up/down arrows.
   *   - Primarily HORIZONTAL tangent → above and below candidates.
   *   - Diagonal/curved tangent → canonical perpendicular both directions.
   */
  var STEP = Math.min(4, len / 20);
  for (var si = 0; si < samples.length; si++) {
    var sl = samples[si];
    var sl0 = Math.max(0, sl - STEP), sl1 = Math.min(len, sl + STEP);
    var pA = pathEl.getPointAtLength(sl0), pB = pathEl.getPointAtLength(sl1);
    var tx = pB.x - pA.x, ty = pB.y - pA.y;
    var tl = Math.sqrt(tx*tx + ty*ty) || 1;
    var pt = pathEl.getPointAtLength(sl);
    var ax = Math.abs(tx), ay = Math.abs(ty);
    if (ay >= ax * 2) {
      /* primarily vertical: centre on line; sides are fallbacks only */
      cands.push({cx: pt.x,         cy: pt.y});
      cands.push({cx: pt.x + NUDGE, cy: pt.y});
      cands.push({cx: pt.x - NUDGE, cy: pt.y});
    } else if (ax >= ay * 2) {
      /* primarily horizontal: above first (preferred), then below.
       * Use NUDGE_H (larger on short lines) to keep the label clear of arrowheads. */
      cands.push({cx: pt.x, cy: pt.y - NUDGE_H});
      cands.push({cx: pt.x, cy: pt.y + NUDGE_H});
    } else {
      /* diagonal / curved: canonical perpendicular both directions */
      /* normalize tangent so first candidate is always on the same geometric side */
      if (ay >= ax) { if (ty > 0) { tx = -tx; ty = -ty; } }
      else          { if (tx < 0) { tx = -tx; ty = -ty; } }
      var nx = -ty / tl, ny = tx / tl;
      cands.push({cx: pt.x + nx*NUDGE, cy: pt.y + ny*NUDGE});
      cands.push({cx: pt.x - nx*NUDGE, cy: pt.y - ny*NUDGE});
    }
  }
  return cands;
}

/* ── scoring ────────────────────────────────────────────────────────── */
function overlap(ax,ay,aw,ah, bx,by,bw,bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

function score(rx,ry,rw,rh, ownPath, pathSamples, cards, placed) {
  var n = 0;
  /* path samples: +1 per path whose sample points enter the pill */
  for (var pi = 0; pi < pathSamples.length; pi++) {
    var entry = pathSamples[pi];
    if (entry[0] === ownPath) continue;
    var pts = entry[1];
    var ex = rx-2, ey = ry-2, ew = rw+4, eh = rh+4;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].x >= ex && pts[i].x <= ex+ew &&
          pts[i].y >= ey && pts[i].y <= ey+eh) { n += 1; break; }
    }
  }
  /* card rects: +10 per overlap (high penalty so any gap position wins) */
  for (var ci = 0; ci < cards.length; ci++) {
    var c = cards[ci];
    if (overlap(rx,ry,rw,rh, c.x,c.y,c.w,c.h)) n += 10;
  }
  /* already-placed pills: +4 per overlap, plus soft proximity penalty */
  for (var li = 0; li < placed.length; li++) {
    var l = placed[li];
    if (overlap(rx,ry,rw,rh, l.x,l.y,l.w,l.h)) {
      n += 4;
    } else {
      /* soft repulsion: add up to +2 that fades with distance from centre-to-centre */
      var dcx = (rx + rw/2) - (l.x + l.w/2);
      var dcy = (ry + rh/2) - (l.y + l.h/2);
      var dist = Math.sqrt(dcx*dcx + dcy*dcy);
      var REPEL = 80; /* px — full repulsion within this radius */
      if (dist < REPEL) n += 2 * (1 - dist / REPEL);
    }
  }
  return n;
}

/* ── main ───────────────────────────────────────────────────────────── */
function placeLabels() {
  var svgEl = document.querySelector('svg');
  if (!svgEl) return;
  var PAD_X = 5, PAD_Y = 3;
  var ns = 'http://www.w3.org/2000/svg';

  /* card obstacles */
  var cards = [];
  svgEl.querySelectorAll('rect[id^="cell-"]').forEach(function(el) {
    var b = el.getBBox();
    cards.push({x:b.x, y:b.y, w:b.width, h:b.height});
  });

  /* path samples (32 pts per path) */
  var pathSamples = [];
  svgEl.querySelectorAll('path[id^="conn-path-"]').forEach(function(el) {
    pathSamples.push([el, samplePath(el, 32)]);
  });

  /* sort label elements by conn index */
  var labelEls = Array.from(svgEl.querySelectorAll('text[id^="conn-label-"]'));
  labelEls.sort(function(a,b) {
    return parseInt(a.id.replace('conn-label-','')) -
           parseInt(b.id.replace('conn-label-',''));
  });

  var placed = [];

  labelEls.forEach(function(labelEl) {
    var ci = labelEl.id.replace('conn-label-','');
    var pathEl = svgEl.getElementById('conn-path-'+ci);
    if (!pathEl) { labelEl.removeAttribute('opacity'); return; }

    var labelNear = pathEl.dataset.labelNear || null;

    /* measure actual text — temporarily un-hide */
    labelEl.setAttribute('style','opacity:0');
    var tb = labelEl.getBBox();
    var tw = tb.width, th = tb.height;
    if (tw < 1) { labelEl.setAttribute('style',''); return; }

    var rw = tw + 2*PAD_X, rh = th + 2*PAD_Y;

    /* generate & score candidates */
    var cands = candidates(pathEl, labelNear, tw, th);
    if (!cands.length) { labelEl.setAttribute('style',''); return; }

    /* exclude cards containing either path endpoint from obstacle scoring —
     * those are the two cells this connection actually joins, so the label
     * is allowed to touch them (it sits right between them). */
    var pLen = pathEl.getTotalLength();
    var ep0 = pathEl.getPointAtLength(0);
    var ep1 = pathEl.getPointAtLength(pLen);
    var cardsForScoring = cards.filter(function(c) {
      function containsPt(p) {
        return p.x >= c.x-2 && p.x <= c.x+c.w+2 &&
               p.y >= c.y-2 && p.y <= c.y+c.h+2;
      }
      return !containsPt(ep0) && !containsPt(ep1);
    });

    var best = null, bestScore = Infinity;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var rx = c.cx - rw/2, ry = c.cy - rh/2;
      var s = score(rx,ry,rw,rh, pathEl, pathSamples, cardsForScoring, placed);
      if (s < bestScore) { bestScore = s; best = {cx:c.cx,cy:c.cy,rx:rx,ry:ry}; }
    }

    /* insert background rect */
    var rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x',  best.rx.toFixed(1));
    rect.setAttribute('y',  best.ry.toFixed(1));
    rect.setAttribute('width',  rw.toFixed(1));
    rect.setAttribute('height', rh.toFixed(1));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', '#fff');
    rect.setAttribute('fill-opacity', '0.92');
    labelEl.parentNode.insertBefore(rect, labelEl);

    /* reposition text: shift by delta from current bbox centre to best centre */
    var xa = parseFloat(labelEl.getAttribute('x')) || 0;
    var ya = parseFloat(labelEl.getAttribute('y')) || 0;
    var newX = (xa + best.cx - (tb.x + tw/2)).toFixed(1);
    var newY = (ya + best.cy - (tb.y + th/2)).toFixed(1);
    labelEl.setAttribute('x', newX);
    labelEl.setAttribute('y', newY);
    labelEl.setAttribute('text-anchor', 'middle');
    /* propagate new x to tspan children (wrapped multi-line labels) */
    labelEl.querySelectorAll('tspan').forEach(function(ts) {
      ts.setAttribute('x', newX);
    });
    labelEl.setAttribute('style', '');
    labelEl.removeAttribute('opacity');

    /* track placed rect */
    placed.push({x:best.rx, y:best.ry, w:rw, h:rh});

    /* click overlay for ref tooltip (if label has a data-idx) */
    var idx = labelEl.dataset.connLabelIdx;
    if (idx !== undefined && idx !== '') {
      var ov = document.createElementNS(ns, 'rect');
      ov.setAttribute('class', 'lc-conn-click');
      ov.setAttribute('data-idx', idx);
      ov.setAttribute('x',  best.rx.toFixed(1));
      ov.setAttribute('y',  best.ry.toFixed(1));
      ov.setAttribute('width',  rw.toFixed(1));
      ov.setAttribute('height', rh.toFixed(1));
      ov.setAttribute('rx', '3');
      ov.setAttribute('fill', 'transparent');
      ov.setAttribute('cursor', 'pointer');
      ov.setAttribute('opacity', '0');
      labelEl.parentNode.insertBefore(ov, labelEl.nextSibling);
      ov.addEventListener('click', function(e) {
        e.stopPropagation();
        var d = (window.lcConnLabels||[])[+ov.dataset.idx];
        if (!d) return;
        if (window.activeItem === d.label) { if(window.hide) window.hide(); }
        else { if(window.show) window.show(d.refs, d.label, e); }
      });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', placeLabels);
} else {
  placeLabels();
}

})();`;
}

// ════════════════════════════════════════════════════════════════════════════
// ── Logo helper (shared by lifecycle + lifecycle-t) ──────────────────────────
// Accepts lane.logo as either:
//   { src: "data:image/png;base64,...", alt: "FCC" }   ← data URI, pass-through
//   { src: "./fcc-logo.png", alt: "FCC" }              ← file path, embedded at build time
// Returns { src: <data URI or original>, alt } or null if logo absent/unreadable.
function resolveLogoSrc(logoVal, configDir) {
  if (!logoVal || !logoVal.src) return null;
  const src = logoVal.src.trim();
  const alt = logoVal.alt || '';
  const url = logoVal.url || null;
  // Already a data URI — pass through unchanged.
  if (src.startsWith('data:')) return { src, alt, url };
  // File path — resolve relative to the JSON config's directory and embed.
  const absPath = path.isAbsolute(src) ? src : path.join(configDir, src);
  try {
    const buf      = fs.readFileSync(absPath);
    const ext      = path.extname(absPath).toLowerCase().replace('.', '');
    const mimeMap  = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                       gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
    const mime     = mimeMap[ext] || 'image/png';
    return { src: `data:${mime};base64,${buf.toString('base64')}`, alt, url };
  } catch (e) {
    console.warn(`Warning: could not read logo file "${absPath}" — skipping logo.`);
    return null;
  }
}

// ── Colour helpers (shared by lifecycle + lifecycle-t) ───────────────────────
// Blends hex t-fraction toward white (t=1 → pure white).
// Used for lane backgrounds: stripe at 88%, label box at 78%.
// Blends a hex color 72% toward white — produces a low-saturation pastel tint
// used for non-highlighted lane header backgrounds.
function pastelify(hex, t = 0.88) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  const pr = Math.round(r + (255 - r) * t);
  const pg = Math.round(g + (255 - g) * t);
  const pb = Math.round(b + (255 - b) * t);
  return '#' + [pr,pg,pb].map(v => v.toString(16).padStart(2,'0')).join('');
}
// Blends hex t-fraction toward black (t=0.5 → half-dark). Used for label text.
function darkenHex(hex, t = 0.45) {
  const r = Math.round(parseInt(hex.slice(1,3), 16) * (1 - t));
  const g = Math.round(parseInt(hex.slice(3,5), 16) * (1 - t));
  const b = Math.round(parseInt(hex.slice(5,7), 16) * (1 - t));
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

// LIFECYCLE LAYOUT  —  fully SVG-based, pixel-computed layout
// ════════════════════════════════════════════════════════════════════════════
//
// JSON schema:
//   lanes:       [{ id, label, color, textColor, borderColor }]
//   stages:      [{ number, label, cells: { laneId: { title, type?, items[], refs[] } } }]
//   connections: [{ from: "laneId-stageNum", to: "laneId-stageNum",
//                   label?, color?, dashed? }]
//   spans:       [{ label, color, refs[] }]   — full-width footer banners
//
// Cell types:
//   (default)  — plain action card, rect with rounded corners
//   "decision" — amber dashed border, ◆ badge, for Yes/No branch nodes

function buildLifecycle() {
  const lanes       = config.lanes;
  const stages      = config.stages;
  const spans       = config.spans       || [];
  const connections = config.connections || [];

  // ── Geometry constants ────────────────────────────────────────────────────
  const MARGIN     = 24;
  const LL_W       = 112;   // lane-label column width
  const LL_GAP     = 44;    // gap between label and first stage column
  const COL_W      = 172;   // stage column card width
  const COL_GAP    = 56;    // gap between stage columns (arrow corridor)
  const ROW_GAP    = 80;    // gap between lane rows (doubles as arrow corridor)
  const HDR_H      = 52;    // stage header row height
  const CP         = 10;    // card horizontal padding & bottom gap
  const CP_TOP     = 3;     // card title-top gap (0-like, just clears ascenders)
  const CARD_R     = 7;     // card corner radius
  const ITEM_INDENT= 8;     // bullet indent inside card
  const SPAN_H     = 38;
  const SPAN_GAP   = 8;
  const CHARS      = 20;    // approx chars per line in card (COL_W=160, ~8px/ch)
  const TH         = 14;    // title line height
  const IH         = 12;    // item line height
  const RH         = 11;    // refs line height
  const BADGE_H    = 14;    // decision badge height
  const SC_H       = 16;    // owners badge height

  // ── Proportional text-width estimator ────────────────────────────────────
  function textW(str, fontSize) {
    if (!str) return 0;
    const scale = fontSize / 10;
    let w = 0;
    for (const ch of str) {
      if (' il|.,;:!\'"§`'.indexOf(ch) >= 0) w += 3.2;
      else if ('fjrt'.indexOf(ch) >= 0)       w += 4.8;
      else if ('MWmw'.indexOf(ch) >= 0)       w += 8.5;
      else if (ch >= 'A' && ch <= 'Z')        w += 7.0;
      else if (ch >= '0' && ch <= '9')        w += 6.0;
      else                                    w += 5.8;
    }
    return w * scale;
  }

  // ── Wrap refs array into lines fitting maxPx at font-size 8.5 ────────────
  function wrapRefs(refs, maxPx) {
    const SEP_W = textW(' · ', 8.5);
    const lines = [], len = refs.length;
    let line = [], lineW = 0;
    for (let i = 0; i < len; i++) {
      const tokW = textW('\u00a7\u00a0' + refs[i], 8.5);
      const needed = line.length ? SEP_W + tokW : tokW;
      if (line.length && lineW + needed > maxPx) {
        lines.push(line); line = [refs[i]]; lineW = tokW;
      } else {
        line.push(refs[i]); lineW += needed;
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  // ── Text wrapping (server-side) ───────────────────────────────────────────
  function wrap(text, maxCh) {
    if (!text) return [];
    const words = String(text).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (test.length > maxCh && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ── Title wrapping — pixel-accurate at font-size 11 ──────────────────────
  const TITLE_MAX_PX = COL_W - 2 * CP;   // 152px
  function wrapTitle(text) {
    if (!text) return [];
    const words = String(text).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (cur && textW(test, 11) > TITLE_MAX_PX) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ── Compute card height from cell content ─────────────────────────────────
  function cardHeight(cell) {
    if (!cell) return 0;
    let h = CP_TOP;
    const annCount = (cell.annotations || []).length;
    h += annCount * (BADGE_H + 2);
    h += wrapTitle(cell.title || "").length * TH + 4;
    // bannerH+4 gap: rendered when annCount>0 (or always as titleZoneH+4 guard)
    if (annCount > 0) h += 4;
    if (cell.owners) h += SC_H;
    for (const it of (cell.items || [])) {
      const itText = typeof it === "string" ? it : (it.text || "");
      h += wrap(itText, CHARS - 2).length * IH;
      if (typeof it === "object" && it.owner) h += IH;
    }
    if ((cell.items || []).length) h += 4;
    const refs = cell.refs || [];
    if (refs.length) {
      const refLineCount = wrapRefs(refs, COL_W - CP * 2).length;
      h += refLineCount * RH + 4;
    }
    h += CP;
    return Math.max(h, 56);
  }

  // Lane heights = max card height across all stages for that lane
  const laneHeights = lanes.map(ln =>
    Math.max(...stages.map(st => cardHeight((st.cells || {})[ln.id])), 56)
  );

  // Pre-scan connections to determine whether the outer corridors are used:
  //   top corridor  (above lane 0)      ← same-lane rightward arrow with obstacle in lane 0
  //   bottom corridor (below last lane) ← same-lane backward (leftward) arrow in last lane
  const firstLaneId = lanes[0].id;
  const lastLaneId  = lanes[lanes.length - 1].id;
  const SLIM = 40;  // tight gap when corridor has no arrows

  function connNeedsTopCorridor(conn) {
    const fpk = conn.from.slice(0, conn.from.lastIndexOf('-'));
    const tpk = conn.to.slice(0, conn.to.lastIndexOf('-'));
    if (fpk !== firstLaneId || tpk !== firstLaneId) return false;
    const fromSnum = conn.from.slice(conn.from.lastIndexOf('-') + 1);
    const toSnum   = conn.to.slice(conn.to.lastIndexOf('-') + 1);
    const fromSi   = stages.findIndex(s => String(s.number) === fromSnum);
    const toSi     = stages.findIndex(s => String(s.number) === toSnum);
    // Backward same-lane connections in lane 0 may be routed above by Pass C.
    if (toSi < fromSi) return true;
    if (toSi === fromSi) return false;
    const lo = fromSi, hi = toSi;
    return stages.slice(lo + 1, hi).some(st => (st.cells || {})[firstLaneId]);
  }
  function connNeedsBotCorridor(conn) {
    const fpk = conn.from.slice(0, conn.from.lastIndexOf('-'));
    const tpk = conn.to.slice(0, conn.to.lastIndexOf('-'));
    if (fpk !== lastLaneId || tpk !== lastLaneId) return false;
    const fromSnum = conn.from.slice(conn.from.lastIndexOf('-') + 1);
    const toSnum   = conn.to.slice(conn.to.lastIndexOf('-') + 1);
    const fromSi   = stages.findIndex(s => String(s.number) === fromSnum);
    const toSi     = stages.findIndex(s => String(s.number) === toSnum);
    return toSi < fromSi;  // going left = backward arrow routes below the lane
  }

  const needsTop = connections.some(connNeedsTopCorridor);
  const needsBot = connections.some(connNeedsBotCorridor);
  const topGap   = needsTop ? ROW_GAP : SLIM;
  const botGap   = needsBot ? ROW_GAP : SLIM;

  // Cumulative lane Y positions (top of each lane's card area)
  const laneY = [];
  let cy = MARGIN + HDR_H + topGap;
  for (let li = 0; li < lanes.length; li++) {
    laneY.push(cy);
    // Use botGap after the last lane, ROW_GAP between all others
    cy += laneHeights[li] + (li === lanes.length - 1 ? botGap : ROW_GAP);
  }

  // Stage column X positions (left edge of card)
  function colX(si) {
    return MARGIN + LL_W + LL_GAP + si * (COL_W + COL_GAP);
  }

  // Build a lookup: "laneId-stageNum" → { x, y, w, h, cx, cy }
  const cellRects = {};
  for (let li = 0; li < lanes.length; li++) {
    for (let si = 0; si < stages.length; si++) {
      const key = `${lanes[li].id}-${stages[si].number}`;
      const cell = (stages[si].cells || {})[lanes[li].id];
      if (cell) {
        const x = colX(si);
        const y = laneY[li];
        const w = COL_W;
        const h = laneHeights[li];
        cellRects[key] = { x, y, w, h, cx: x + w/2, cy: y + h/2 };
      }
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const allRefs = new Set();
  for (const st of stages)
    for (const cell of Object.values(st.cells || {}))
      for (const r of (cell.refs || [])) allRefs.add(r);
  for (const sp of spans) for (const r of (sp.refs || [])) allRefs.add(r);

  // ── SVG dimensions ────────────────────────────────────────────────────────
  const gridW   = colX(stages.length - 1) + COL_W + MARGIN;
  const spansH  = spans.length ? (SPAN_GAP + spans.length * (SPAN_H + SPAN_GAP)) : 0;
  const svgH    = cy + spansH + MARGIN;
  const svgW    = gridW;

  // ── Helpers for rendering SVG text ────────────────────────────────────────
  function svgEsc(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Multi-line SVG text block, returns [svg string, total height used]
  function svgTextBlock(lines, x, y, fontSize, fill, fontWeight, lineH) {
    let out = "";
    for (let i = 0; i < lines.length; i++) {
      out += `<text x="${x}" y="${y + i * lineH}" font-size="${fontSize}" fill="${svgEsc(fill)}"${fontWeight ? ` font-weight="${fontWeight}"` : ""}>${svgEsc(lines[i])}</text>`;
    }
    return [out, lines.length * lineH];
  }

  // ── Build SVG ─────────────────────────────────────────────────────────────
  let svg = "";

  // Background
  svg += `<rect width="${svgW}" height="${svgH}" rx="12" fill="#f0f4f8"/>`;

  // Lane stripe backgrounds (full width behind cards)
  for (let li = 0; li < lanes.length; li++) {
    const lane   = lanes[li];
    const lBgRaw  = lane.stripColor || lane.color || "#f8fafc";
    const lBdrS   = lane.borderColor || "#e2e8f0";
    const stripFill = lane.highlight === true
      ? pastelify(lBgRaw, 0.44)
      : pastelify(lBdrS !== "#e2e8f0" ? lBdrS : borderColor);
    const stripY = laneY[li] - ROW_GAP / 4;
    const stripH = laneHeights[li] + ROW_GAP / 2;
    svg += `<rect x="0" y="${stripY}" width="${svgW}" height="${stripH}" rx="0" fill="${svgEsc(stripFill)}" opacity="0.65"/>`;
  }

  // Stage column shading (subtle alternating)
  for (let si = 0; si < stages.length; si++) {
    if (si % 2 === 0) {
      svg += `<rect x="${colX(si) - COL_GAP/2}" y="0" width="${COL_W + COL_GAP}" height="${svgH}" fill="#000" opacity="0.018" rx="4"/>`;
    }
  }

  // Stage header boxes
  for (let si = 0; si < stages.length; si++) {
    const st = stages[si];
    const x  = colX(si);
    const y  = MARGIN;
    const w  = COL_W;
    const h  = HDR_H - 6;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#e2e8f0"/>`;
    svg += `<text x="${x + w/2}" y="${y + 18}" text-anchor="middle" font-size="18" font-weight="800" fill="${svgEsc(borderColor)}">${svgEsc(st.number)}</text>`;
    const lblLines = wrap(st.label, Math.floor(COL_W / 8.4));
    lblLines.forEach((ln, i) => {
      svg += `<text x="${x + w/2}" y="${y + 32 + i * 14}" text-anchor="middle" font-size="12" font-weight="700" fill="#475569">${acroSvgInner(ln, effectiveAcronyms)}</text>`;
    });
  }

  // Lane labels (left column)
  const configDir = path.dirname(path.resolve(configPath));
  for (let li = 0; li < lanes.length; li++) {
    const lane   = lanes[li];
    const lBg    = lane.color      || "#f8fafc";
    const lTxt   = lane.textColor  || "#334155";
    const lBdr   = lane.borderColor|| "#e2e8f0";
    const y      = laneY[li];
    const h      = laneHeights[li];
    // Highlighted lanes keep their full lBg in the header strip;
    // all others get a pastel derived from the lane border colour.
    const isHighlightL = lane.highlight === true;
    const labelSrc     = lBdr !== "#e2e8f0" ? lBdr : borderColor;
    const labelBoxFill = isHighlightL ? lBg  : pastelify(labelSrc, 0.78);
    const labelTxt     = isHighlightL ? lTxt : darkenHex(labelSrc, 0.45);
    svg += `<rect x="${MARGIN}" y="${y}" width="${LL_W}" height="${h}" rx="8" fill="${svgEsc(labelBoxFill)}" stroke="${svgEsc(lBdr)}" stroke-width="1.5"/>`;

    const logo = resolveLogoSrc(lane.logo, configDir);
    const LOGO_SZ = 72;
    const LOGO_GAP = 8;   // gap between logo bottom and first text line
    if (logo) {
      // Logo + text stacked, the whole group vertically centred in the strip.
      const lblLines = wrap(lane.label, Math.floor(LL_W / 10.8));
      const textH    = lblLines.length * 20;
      const groupH   = LOGO_SZ + LOGO_GAP + textH;
      const groupTop = y + h / 2 - groupH / 2;
      const lx = MARGIN + LL_W / 2 - LOGO_SZ / 2;
      const ly = groupTop;
      svg += `${logo.url ? `<a href="${svgEsc(logo.url)}" target="_blank" rel="noopener noreferrer">` : ""}<image href="${svgEsc(logo.src)}" x="${lx}" y="${ly}" width="${LOGO_SZ}" height="${LOGO_SZ}" preserveAspectRatio="xMidYMid meet" style="cursor:${logo.url ? "pointer" : "default"}"><title>${svgEsc(logo.alt)}</title></image>${logo.url ? "</a>" : ""}`;
      const startY = groupTop + LOGO_SZ + LOGO_GAP + 10;  // +10 for SVG text baseline
      lblLines.forEach((ln, i) => {
        svg += `<text x="${MARGIN + LL_W/2}" y="${startY + i * 20}" text-anchor="middle" font-size="16" font-weight="700" fill="${svgEsc(labelTxt)}">${acroSvgInner(ln, effectiveAcronyms)}</text>`;
      });
    } else {
      const lblLines = wrap(lane.label, Math.floor(LL_W / 10.8));
      const totalH   = lblLines.length * 20;
      const startY   = y + h/2 - totalH/2 + 10;
      lblLines.forEach((ln, i) => {
        svg += `<text x="${MARGIN + LL_W/2}" y="${startY + i * 20}" text-anchor="middle" font-size="16" font-weight="700" fill="${svgEsc(labelTxt)}">${acroSvgInner(ln, effectiveAcronyms)}</text>`;
      });
    }
  }

  // ── Cards ────────────────────────────────────────────────────────────────
  // Collect clickable items for JS
  const clickItems      = [];
  const annotationItems = [];

  for (let li = 0; li < lanes.length; li++) {
    const lane        = lanes[li];
    const lBg         = lane.color       || "#f8fafc";
    const lTxt        = lane.textColor   || "#334155";
    const lBdr        = lane.borderColor || "#e2e8f0";
    // Highlighted = lane.highlight is explicitly true in the JSON config.
    // Highlighted lanes use lBg (their full colour) for card title bands;
    // all other lanes use the lane's own border colour.
    const isHighlight = lane.highlight === true;
    const labelSrc    = lBdr !== "#e2e8f0" ? lBdr : borderColor;
    // accent = the colour used for the card header band
    const accent      = isHighlight ? lBg : labelSrc;

    for (let si = 0; si < stages.length; si++) {
      const st   = stages[si];
      const cell = (st.cells || {})[lane.id];
      if (!cell) continue;

      const x    = colX(si);
      const y    = laneY[li];
      const w    = COL_W;
      const h    = laneHeights[li];
      const annotationsArr = cell.annotations || [];
      const isAnnotated    = annotationsArr.length > 0;
      const refs      = cell.refs || [];
      const cellId    = `cell-${lane.id}-${st.number}`;

      // Pre-compute title lines so we can size the header band
      const titleLines = wrapTitle(cell.title || "");

      const titleZoneH     = CP_TOP + titleLines.length * TH + 6;
      const annotationsZoneH = annotationsArr.length * (BADGE_H + 2);
      const bannerH          = titleZoneH + annotationsZoneH;

      // annotation band color = first annotation's color, fallback amber
      const annotColor     = (annotationsArr[0] && annotationsArr[0].color) || "#fbbf24";
      const cardFill       = isAnnotated ? hexTint(annotColor, 0.18) : "#ffffff";
      const titleBandColor = accent;
      const strokeW        = isAnnotated ? "1.5" : "1";
      const dashArr        = isAnnotated ? `stroke-dasharray="4,3"` : "";
      const cardStroke     = isAnnotated ? "none" : titleBandColor;
      svg += `<rect id="${cellId}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${CARD_R}" fill="${cardFill}" stroke="${svgEsc(cardStroke)}" stroke-width="${strokeW}" filter="url(#cs)"/>`;

      // Title zone band fill
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${titleZoneH}" rx="${CARD_R}" fill="${svgEsc(titleBandColor)}"/>`;
      svg += `<rect x="${x}" y="${y + titleZoneH - CARD_R}" width="${w}" height="${CARD_R}" fill="${svgEsc(titleBandColor)}"/>`;
      // Title zone stroke overlay — solid accent covers top + left + right of title zone
      if (isAnnotated) {
        svg += `<path d="M ${x},${y+titleZoneH} L ${x},${y+CARD_R} Q ${x},${y} ${x+CARD_R},${y} L ${x+w-CARD_R},${y} Q ${x+w},${y} ${x+w},${y+CARD_R} L ${x+w},${y+titleZoneH}" fill="none" stroke="${svgEsc(titleBandColor)}" stroke-width="${strokeW}"/>`;
      }

      // Annotations zone band flush below title zone — each annotation may have its own color
      if (isAnnotated && annotationsZoneH > 0) {
        let ay = y + titleZoneH;
        for (const ann of annotationsArr) {
          const ac = ann.color || "#fbbf24";
          svg += `<rect x="${x}" y="${ay}" width="${w}" height="${BADGE_H + 2}" fill="${svgEsc(ac)}"/>`;
          ay += BADGE_H + 2;
        }
      }

      // Body outline: 3-sided path (left + bottom + right, no top).
      { const bx=x, by=y+titleZoneH, bw=w, bh=h-titleZoneH, r=CARD_R;
        const bodyStroke = isAnnotated ? annotColor : lBdr;
        const bodyD = `M ${bx},${by} L ${bx},${by+bh-r} Q ${bx},${by+bh} ${bx+r},${by+bh} L ${bx+bw-r},${by+bh} Q ${bx+bw},${by+bh} ${bx+bw},${by+bh-r} L ${bx+bw},${by}`;
        svg += `<path d="${bodyD}" fill="none" stroke="${svgEsc(bodyStroke)}" stroke-width="${strokeW}" ${dashArr}/>`;
      }

      // Text content — title first, then annotation badges
      let ty = y + CP_TOP;

      // Title text (always first)
      const titleFill = "#ffffff";
      titleLines.forEach((ln, i) => {
        svg += `<text x="${x + CP}" y="${ty + (i + 1) * TH}" font-size="11" font-weight="700" fill="${svgEsc(titleFill)}">${acroSvgInner(ln, effectiveAcronyms)}</text>`;
      });
      ty += titleLines.length * TH + 4;

      // Ensure items start below the title band
      if (ty < y + titleZoneH) ty = y + titleZoneH;

      // Annotation badges (colored zone, below title)
      for (const ann of annotationsArr) {
        const ac = ann.color || "#fbbf24";
        // WCAG relative luminance — linearise sRGB then weight channels
        const hex = ac.replace("#","");
        const [rl, gl, bl] = [hex.slice(0,2), hex.slice(2,4), hex.slice(4,6)]
          .map(h => { const s = parseInt(h,16)/255; return s <= 0.04045 ? s/12.92 : ((s+0.055)/1.055)**2.4; });
        const lum = 0.2126*rl + 0.7152*gl + 0.0722*bl;
        const badgeFill = lum < 0.35 ? "#ffffff" : "#78350f";
        svg += `<text x="${x + CP}" y="${ty + BADGE_H - 3}" font-size="9" font-weight="700" fill="${svgEsc(badgeFill)}">${svgEsc(ann.label || "")}</text>`;
        if (ann.text) {
          const ai = annotationItems.length;
          annotationItems.push({ text: ann.text, name: ann.label || "", color: ac });
          svg += `<rect class="lc-annotation-click" data-aidx="${ai}" x="${x}" y="${ty - 2}" width="${w}" height="${BADGE_H + 4}" rx="3" fill="transparent" cursor="pointer" opacity="0"/>`;
        }
        ty += BADGE_H + 2;
      }

      // Ensure items start below the full band
      if (ty < y + bannerH + 4) ty = y + bannerH + 4;

      // Subcomponent badge — pill below the band, on white body
      if (cell.owners) {
        const scTxt = cell.owners;
        const scPx = 6;
        const scW = Math.min(scTxt.length * 6.5 + scPx * 2, w - CP * 2);
        svg += `<rect x="${x + CP}" y="${ty}" width="${scW}" height="${SC_H - 2}" rx="${(SC_H-2)/2}" fill="${hexToRgba(accent, 0.13)}"/>`;
        svg += `<text x="${x + CP + scPx}" y="${ty + SC_H - 6}" font-size="8" font-weight="700" fill="${svgEsc(accent)}">${svgEsc(scTxt)}</text>`;
        ty += SC_H;
      }

      // Items — always on white body, always dark text
      for (const it of (cell.items || [])) {
        const itText = typeof it === "string" ? it : (it.text || "");
        const itDept = typeof it === "object" ? (it.owner || null) : null;
        const itLines = wrap(itText, CHARS - 2);
        svg += `<text x="${x + CP}" y="${ty + IH}" font-size="9" fill="#475569">&#x2022;</text>`;
        itLines.forEach((ln, i) => {
          svg += `<text x="${x + CP + ITEM_INDENT}" y="${ty + (i + 1) * IH}" font-size="9" fill="#475569">${acroSvgInner(ln, effectiveAcronyms)}</text>`;
        });
        ty += itLines.length * IH;
        if (itDept) {
          svg += `<text x="${x + CP + ITEM_INDENT}" y="${ty + IH}" font-size="7.5" fill="#94a3b8" font-style="italic">${svgEsc("— " + itDept)}</text>`;
          ty += IH;
        }
      }
      if ((cell.items || []).length) ty += 4;

      // Refs lines — wrapped to fit card width, defined gray / undefined red
      if (refs.length) {
        const refLines = wrapRefs(refs, w - CP * 2);
        refLines.forEach(function(lineRefs, li) {
          svg += `<text x="${x + CP}" y="${ty + RH + li * RH}" font-size="8.5" font-style="italic">${refsInnerSvg(lineRefs, config.defined, "#94a3b8", "#f87171")}</text>`;
        });
      }

      // Clickable overlay — excludes title area for all cells.
      // headerH = end of non-clickable zone (title band + annotations zone).
      if (refs.length) {
        const idx = clickItems.length;
        const headerH   = titleZoneH + annotationsZoneH;
        const oy = y + headerH;
        const oh = h - headerH;
        clickItems.push({ refs, label: cell.title || "" });
        svg += `<rect class="lc-click" data-idx="${idx}" x="${x}" y="${oy}" width="${w}" height="${oh}" rx="${CARD_R}" fill="transparent" cursor="pointer" opacity="0"/>`;
      }
    }
  }

  // ── Arrows ── orthogonal router with obstacle avoidance ─────────────────────
  // Unique colours → arrowhead marker defs
  const arrowColors = new Set(connections.map(c => c.color || "#64748b"));
  let defs = `<filter id="cs" x="-2%" y="-4%" width="104%" height="108%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.10"/></filter><filter id="as" x="-8%" y="-8%" width="116%" height="116%"><feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="#000" flood-opacity="0.38"/></filter>`;
  for (const col of arrowColors) {
    const mid = col.replace("#", "");
    defs += `<marker id="arr${mid}" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5 Z" fill="${svgEsc(col)}"/></marker>`;
  }

  // Parse "laneId-stageNum" connection key (stage nums may be "2b" etc.)
  function parseKey(key) {
    const dash = key.indexOf('-');
    return { laneId: key.slice(0, dash), stageNum: key.slice(dash + 1) };
  }

  // Rounded-corner orthogonal path helper (exits/enters at right angles, R = corner radius)
  function orthPath(pts, R) {
    // pts = [{x,y}, ...] waypoints; corners get rounded arcs
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev  = pts[i - 1];
      const cur   = pts[i];
      const next  = i < pts.length - 1 ? pts[i + 1] : null;
      if (!next) { d += ` L${cur.x},${cur.y}`; continue; }
      // Approach cur from prev, leave toward next — insert rounded corner
      const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y;
      const dx2 = next.x - cur.x, dy2 = next.y - cur.y;
      const len1 = Math.sqrt(dx1*dx1 + dy1*dy1);
      const len2 = Math.sqrt(dx2*dx2 + dy2*dy2);
      const r = Math.min(R, len1 / 2, len2 / 2);
      const bx = cur.x - r * dx1 / len1, by = cur.y - r * dy1 / len1;
      const ax = cur.x + r * dx2 / len2, ay = cur.y + r * dy2 / len2;
      d += ` L${bx},${by} Q${cur.x},${cur.y} ${ax},${ay}`;
    }
    return d;
  }

  // ── Pre-pass: determine which edge each connection uses, build spread slots ──
  // edgeSlots["cellKey-edge"] = [connIndex, ...] — used to spread attachment points

  // Pre-scan: count corridor loads for each lane so that same-lane forward obstacle
  // connections can be routed through the less-crowded corridor (above or below).
  // Fixed-corridor connections are counted first:
  //   cross-lane multi-stage forward → uses gap below gapLi (and above gapLi+1)
  //   same-lane backward obstacle    → default below, may be reassigned in Pass C
  // Then same-lane forward obstacle connections are assigned greedily (least-loaded wins).
  // Finally (Pass C), backward connections choose the less-loaded arrival edge on their
  // destination cell — keeping them off the bottom edge when top is freer.  Backward arcs
  // already loop around anyway, so they should not compete for the short center-bottom
  // slots that forward arrows prefer.
  const corrChoice     = {};  // ci → 'above' | 'below'  (same-lane forward obstacle)
  const backwardChoice = {};  // ci → 'top'   | 'bottom' (all backward connections)
  {
    const _aboveCor = lanes.map(() => 0);
    const _belowCor = lanes.map(() => 0);
    function baseInfo(conn) {
      const fr = cellRects[conn.from], to = cellRects[conn.to];
      if (!fr || !to) return null;
      const fpk = parseKey(conn.from), tpk = parseKey(conn.to);
      const fromLi = lanes.findIndex(l => l.id === fpk.laneId);
      const toLi   = lanes.findIndex(l => l.id === tpk.laneId);
      const fromSi = stages.findIndex(s => String(s.number) === fpk.stageNum);
      const toSi   = stages.findIndex(s => String(s.number) === tpk.stageNum);
      return { fromLi, toLi, fromSi, toSi,
               sameLane: fromLi === toLi,
               goingRight: toSi > fromSi,
               goingDown:  toLi > fromLi };
    }
    // Pass A: commit fixed-corridor forward connections
    connections.forEach(function(conn) {
      const b = baseInfo(conn);
      if (!b) return;
      const { fromLi, toLi, fromSi, toSi, sameLane, goingRight, goingDown } = b;
      if (sameLane) {
        // backward same-lane obstacle counted tentatively as below; Pass C may reassign
        const li = fromLi;
        const lo = Math.min(fromSi, toSi), hi = Math.max(fromSi, toSi);
        const hasObs = stages.slice(lo + 1, hi).some(st => (st.cells || {})[lanes[li].id]);
        if (hasObs && !goingRight) _belowCor[li]++;
      } else if (fromSi !== toSi && toSi > fromSi) {
        // cross-lane multi-stage forward: routes through gap below gapLi
        const gapLi = goingDown ? fromLi : toLi;
        if (gapLi >= 0 && gapLi < lanes.length) {
          _belowCor[gapLi]++;
          if (gapLi + 1 < lanes.length) _aboveCor[gapLi + 1]++;
        }
      }
    });
    // Pass B: greedily assign same-lane forward obstacle connections
    connections.forEach(function(conn, ci) {
      const b = baseInfo(conn);
      if (!b) return;
      const { fromLi, fromSi, toSi, sameLane, goingRight } = b;
      if (!sameLane) return;
      const li = fromLi;
      const lo = Math.min(fromSi, toSi), hi = Math.max(fromSi, toSi);
      const hasObs = stages.slice(lo + 1, hi).some(st => (st.cells || {})[lanes[li].id]);
      if (!hasObs || !goingRight) return;
      if (_aboveCor[li] <= _belowCor[li]) { corrChoice[ci] = 'above'; _aboveCor[li]++; }
      else                                { corrChoice[ci] = 'below'; _belowCor[li]++; }
    });
    // Pass C: assign backward connections (toSi < fromSi) to the less-loaded arrival
    // edge of the destination cell.  We tally top/bottom load per cell from all
    // already-committed non-backward connections, then greedily assign each backward
    // connection to whichever edge is less loaded.
    //
    // Edge mapping when toEdge flips to 'top':
    //   same-lane backward:          bottom→bottom  becomes  top→top
    //   cross-lane backward going up: top→bottom    becomes  top→top
    //   cross-lane backward going dn: bottom→top    becomes  bottom→bottom
    const _cellTopLoad    = {};  // cellKey → int
    const _cellBottomLoad = {};
    function _incEdge(cellKey, edge) {
      if (edge === 'top')    _cellTopLoad[cellKey]    = (_cellTopLoad[cellKey]    || 0) + 1;
      if (edge === 'bottom') _cellBottomLoad[cellKey] = (_cellBottomLoad[cellKey] || 0) + 1;
    }
    // Seed with all non-backward connections
    connections.forEach(function(conn, ci) {
      const b = baseInfo(conn);
      if (!b) return;
      const { fromLi, toLi, fromSi, toSi, sameLane, goingRight, goingDown } = b;
      const isBackward = toSi < fromSi;
      if (isBackward) return;   // skip — these are the ones we're about to assign
      let fromEdge, toEdge;
      if (sameLane) {
        const lo = Math.min(fromSi, toSi), hi = Math.max(fromSi, toSi);
        const hasObs = stages.slice(lo + 1, hi).some(st => (st.cells || {})[lanes[fromLi].id]);
        if (!hasObs && goingRight) { fromEdge = 'right'; toEdge = 'left'; }
        else if (goingRight) {
          const useAbove = corrChoice[ci] !== 'below';
          fromEdge = useAbove ? 'top' : 'bottom';
          toEdge   = useAbove ? 'top' : 'bottom';
        } else { fromEdge = 'bottom'; toEdge = 'bottom'; }
      } else {
        fromEdge = goingDown ? 'bottom' : 'top';
        toEdge   = goingDown ? 'top'    : 'bottom';
      }
      _incEdge(conn.from, fromEdge);
      _incEdge(conn.to,   toEdge);
    });
    // Greedily assign each backward connection
    connections.forEach(function(conn, ci) {
      const b = baseInfo(conn);
      if (!b) return;
      const { fromLi, toLi, fromSi, toSi, sameLane, goingDown } = b;
      const isBackward = toSi < fromSi;
      if (!isBackward) return;
      const destKey = conn.to;
      const topLoad    = _cellTopLoad[destKey]    || 0;
      const bottomLoad = _cellBottomLoad[destKey] || 0;
      const useTop = topLoad <= bottomLoad;
      backwardChoice[ci] = useTop ? 'top' : 'bottom';
      // count the chosen arrival edge
      _incEdge(destKey, useTop ? 'top' : 'bottom');
      // count the departure edge (determined by routing type + choice)
      if (sameLane) {
        _incEdge(conn.from, useTop ? 'top' : 'bottom');
      } else {
        // cross-lane: departure edge is fixed by lane direction
        _incEdge(conn.from, goingDown ? 'bottom' : 'top');
      }
    });
  }

  function getEdges(conn, ci) {
    const fr = cellRects[conn.from];
    const to = cellRects[conn.to];
    if (!fr || !to) return null;
    const fpk    = parseKey(conn.from);
    const tpk    = parseKey(conn.to);
    const fromLi = lanes.findIndex(l => l.id === fpk.laneId);
    const toLi   = lanes.findIndex(l => l.id === tpk.laneId);
    const fromSi = stages.findIndex(s => String(s.number) === fpk.stageNum);
    const toSi   = stages.findIndex(s => String(s.number) === tpk.stageNum);
    const sameLane   = fromLi === toLi;
    const goingRight = toSi > fromSi;
    const goingDown  = toLi > fromLi;
    const isBackward = toSi < fromSi;
    let fromEdge, toEdge;
    if (sameLane) {
      const lo = Math.min(fromSi, toSi), hi = Math.max(fromSi, toSi);
      const hasObs = stages.slice(lo + 1, hi).some(st => (st.cells || {})[lanes[fromLi].id]);
      if (!hasObs && goingRight) { fromEdge = "right"; toEdge = "left"; }
      else if (goingRight) {
        const useAbove = ci === undefined || corrChoice[ci] !== 'below';
        fromEdge = useAbove ? "top" : "bottom";
        toEdge   = useAbove ? "top" : "bottom";
      } else {
        // backward same-lane: default bottom/bottom; Pass C may choose top/top
        const useTop = ci !== undefined && backwardChoice[ci] === 'top';
        fromEdge = useTop ? "top" : "bottom";
        toEdge   = useTop ? "top" : "bottom";
      }
    } else {
      if (!isBackward) {
        fromEdge = goingDown ? "bottom" : "top";
        toEdge   = goingDown ? "top"    : "bottom";
      } else {
        // backward cross-lane: edges fixed purely by lane direction (same as forward)
        fromEdge = goingDown ? "bottom" : "top";
        toEdge   = goingDown ? "top"    : "bottom";
      }
    }
    return { fromEdge, toEdge, fromLi, toLi, fromSi, toSi, sameLane, goingRight, goingDown };
  }

  const edgeSlots = {};
  connections.forEach(function(conn, ci) {
    const e = getEdges(conn, ci);
    if (!e) return;
    const fk = conn.from + "-" + e.fromEdge;
    const tk = conn.to   + "-" + e.toEdge;
    (edgeSlots[fk] = edgeSlots[fk] || []).push(ci);
    (edgeSlots[tk] = edgeSlots[tk] || []).push(ci);
  });

  // Sort top/bottom slots by the stage X of the other endpoint so that
  // spread attachment points are assigned left-to-right matching the
  // geometry of the arriving/departing lines — preventing crossings.
  function effectiveStageCx(ci, cellKey) {
    const conn = connections[ci];
    const otherKey = conn.from === cellKey ? conn.to : conn.from;
    const e = getEdges(conn, ci);
    // the lane — use the stage cx of the other cell directly.
    const otherRect = cellRects[otherKey];
    return otherRect ? otherRect.cx : 0;
  }
  // For left/right edges (same-lane, spread along Y), sort by lane span so
  // straighter connections get the nearer slot and curved ones bow past them.
  function laneSpanOfL(ci) {
    const e = getEdges(connections[ci]);
    if (!e) return 0;
    return e.sameLane ? 0 : Math.abs(e.fromLi - e.toLi);
  }
  // When two connections share the same effectiveStageCx (other endpoint is in the
  // same column), a purely positional sort leaves them tied and places opposite-
  // direction arrows side by side. Break ties by direction: arriving connections
  // (conn.to === cellKey) sort before departing ones (conn.from === cellKey).
  // This spreads opposite-direction same-column pairs to opposite sides of the
  // edge rather than clustering them at the same offset.
  function dirTieBreak(ci, cellKey) {
    return connections[ci].to === cellKey ? 0 : 1;  // arrive = 0, depart = 1
  }
  Object.keys(edgeSlots).forEach(function(key) {
    const cellKey = key.replace(/-(top|bottom|left|right)$/, '');
    if (key.endsWith('-top') || key.endsWith('-bottom')) {
      edgeSlots[key].sort(function(a, b) {
        const dx = effectiveStageCx(a, cellKey) - effectiveStageCx(b, cellKey);
        if (dx !== 0) return dx;
        return dirTieBreak(a, cellKey) - dirTieBreak(b, cellKey);
      });
    } else if (key.endsWith('-left') || key.endsWith('-right')) {
      edgeSlots[key].sort(function(a, b) { return laneSpanOfL(a) - laneSpanOfL(b); });
    }
  });

  // Compute a spread attachment point on a card edge for connection ci
  function attach(cellKey, edge, ci) {
    const rect = cellRects[cellKey];
    const slots = edgeSlots[cellKey + "-" + edge] || [];
    const n   = slots.length;
    const pos = slots.indexOf(ci);   // 0-based rank on this edge
    let frac;
    if (n > 1) {
      // Multiple connections: distribute evenly across middle 60% of the edge
      frac = (pos + 1) / (n + 1);
    } else if (n === 1 && (edge === 'top' || edge === 'bottom') && ci !== undefined) {
      // Single connection on a horizontal edge: nudge toward the other cell's column
      // so the line departs/arrives slightly to the side facing its destination.
      const conn      = connections[ci];
      const otherKey  = conn.from === cellKey ? conn.to : conn.from;
      const otherRect = cellRects[otherKey];
      if (otherRect && otherRect.cx !== rect.cx) {
        const dir = otherRect.cx > rect.cx ? 1 : -1;
        frac = Math.min(0.8, Math.max(0.2, 0.5 + dir * 0.18));
      } else {
        frac = 0.5;
      }
    } else {
      frac = 0.5;
    }
    const offset = (frac - 0.5) * 0.6;  // -0.3 … +0.3 of edge half-dimension
    if (edge === "right") return { x: rect.x + rect.w, y: rect.cy + offset * rect.h };
    if (edge === "left")  return { x: rect.x,           y: rect.cy + offset * rect.h };
    if (edge === "top")   return { x: rect.cx + offset * rect.w, y: rect.y            };
    /* bottom */          return { x: rect.cx + offset * rect.w, y: rect.y + rect.h   };
  }

  // ── Pass 1: compute all pts arrays so labels can check against other paths ──
  const allConnPts  = [];
  const allConnMeta = [];  // {laneSpan} — used to select straight vs curved rendering
  connections.forEach(function(conn, ci) {
    const fr = cellRects[conn.from];
    const to = cellRects[conn.to];
    if (!fr || !to) { allConnPts.push(null); allConnMeta.push(null); return; }
    const e = getEdges(conn, ci);
    if (!e) { allConnPts.push(null); allConnMeta.push(null); return; }
    const { fromEdge, toEdge, fromLi, toLi, fromSi, toSi, sameLane, goingRight, goingDown } = e;
    const ap1 = attach(conn.from, fromEdge, ci);
    const ap2 = attach(conn.to,   toEdge,   ci);
    let pts;
    if (sameLane) {
      const li = fromLi;
      const lo = Math.min(fromSi, toSi), hi = Math.max(fromSi, toSi);
      const hasObs = stages.slice(lo + 1, hi).some(st => (st.cells || {})[lanes[li].id]);
      if (!hasObs && goingRight) {
        const horizConns = connections.filter(function(c) {
          const eg = getEdges(c);
          if (!eg || !eg.sameLane || !eg.goingRight) return false;
          const loH = Math.min(eg.fromSi, eg.toSi), hiH = Math.max(eg.fromSi, eg.toSi);
          const obsH = stages.slice(loH + 1, hiH).some(function(st){ return (st.cells||{})[lanes[eg.fromLi].id]; });
          return !obsH && c.from === conn.from;
        });
        const hRank   = horizConns.indexOf(conn);
        const hN      = horizConns.length;
        const hOff    = hN <= 1 ? 0 : ((hRank + 1) / (hN + 1) - 0.5) * 0.5;
        const sharedY = fr.cy + hOff * fr.h;
        pts = [ { x: fr.x + fr.w, y: sharedY }, { x: to.x, y: sharedY } ];
      } else if (goingRight) {
        const useAbove = corrChoice[ci] !== 'below';
        const corridorY = useAbove
          ? laneY[li] - ROW_GAP * 0.6
          : laneY[li] + laneHeights[li] + ROW_GAP * 0.6;
        pts = [ ap1, { x: ap1.x, y: corridorY }, { x: ap2.x, y: corridorY }, ap2 ];
      } else {
        // backward same-lane: route through above-lane corridor when backwardChoice
        // says 'top', otherwise below.  Above = gap above laneY; below = gap below lane bottom.
        const useTopCor = backwardChoice[ci] === 'top';
        const corridorY = useTopCor
          ? laneY[li] - ROW_GAP * 0.6
          : laneY[li] + laneHeights[li] + ROW_GAP * 0.6;
        pts = [ ap1, { x: ap1.x, y: corridorY }, { x: ap2.x, y: corridorY }, ap2 ];
      }
    } else if (fromSi === toSi) {
      const colConns = connections.filter(function(c) {
        const eg = getEdges(c);
        return eg && !eg.sameLane && eg.fromSi === fromSi && eg.toSi === toSi;
      });
      const vRank = colConns.indexOf(conn);
      const vN    = colConns.length;
      const vOff  = vN <= 1 ? 0 : ((vRank + 1) / (vN + 1) - 0.5) * 0.5;
      const colCx = fr.cx + vOff * COL_W;
      pts = [
        { x: colCx, y: goingDown ? fr.y + fr.h : fr.y       },
        { x: colCx, y: goingDown ? to.y         : to.y + to.h }
      ];
    } else {
      const gapLi = goingDown ? fromLi : toLi;
      const gapY  = laneY[gapLi] + laneHeights[gapLi] + ROW_GAP / 2;
      pts = [ ap1, { x: ap1.x, y: gapY }, { x: ap2.x, y: gapY }, ap2 ];
    }
    const laneSpan = sameLane ? 0 : Math.abs(fromLi - toLi);
    allConnPts.push(pts);
    allConnMeta.push({ laneSpan, fromSi, toSi, sameLane });
  });

  // Bezier path for non-contiguous cross-lane connections (bow rightward for vertical travel).
  // Returns { d, ex, ey, tanX, tanY } — path string plus arrival tangent sampled at the
  // point ~ARROW_LEN arc-length back from the endpoint (where the arrowhead base sits),
  // so the polygon is oriented to the actual line direction at that distance, not the
  // degenerate tangent at the very tip.
  function curvedPathLC(pts, laneSpan) {
    const BOW = laneSpan * 22;
    const ARROW_LEN = 14;
    // Walk backwards from t=1 accumulating arc length; return tangent at ~ARROW_LEN px back
    function arrivalTangent(evalFn) {
      // Tip tangent: direction at the very end (tiny step back from t=1)
      const tip = evalFn(1), near = evalFn(1 - 1/60);
      const tipTanX = tip.x - near.x, tipTanY = tip.y - near.y;
      // Base tangent: direction at ~ARROW_LEN arc-length back from endpoint
      const STEPS = 60;
      let prevX = tip.x, prevY = tip.y, cum = 0;
      let baseTanX = tipTanX, baseTanY = tipTanY;
      for (let i = 1; i <= STEPS; i++) {
        const t = 1 - i / STEPS;
        const pt = evalFn(t);
        cum += Math.sqrt((prevX-pt.x)**2 + (prevY-pt.y)**2);
        if (cum >= ARROW_LEN || i === STEPS) {
          baseTanX = prevX - pt.x; baseTanY = prevY - pt.y;
          break;
        }
        prevX = pt.x; prevY = pt.y;
      }
      // Average the two angles for a balanced orientation
      return { tanX: tipTanX + baseTanX, tanY: tipTanY + baseTanY };
    }
    if (pts.length === 2) {
      const p0 = pts[0], p1 = pts[1];
      // When both endpoints share the same x (vertical line), bowing in Y produces
      // a degenerate straight line — all three points collinear. Bow in X instead.
      const isVertical = Math.abs(p0.x - p1.x) < 1;
      const mx = isVertical ? (p0.x + p1.x) / 2 + BOW : (p0.x + p1.x) / 2;
      const my = isVertical ? (p0.y + p1.y) / 2        : (p0.y + p1.y) / 2 + BOW;
      const evalQ = t => ({
        x: (1-t)*(1-t)*p0.x + 2*(1-t)*t*mx + t*t*p1.x,
        y: (1-t)*(1-t)*p0.y + 2*(1-t)*t*my + t*t*p1.y
      });
      const tan = arrivalTangent(evalQ);
      return { d: `M${p0.x},${p0.y} Q${mx},${my} ${p1.x},${p1.y}`,
               ex: p1.x, ey: p1.y, ...tan };
    }
    const p0 = pts[0], c1 = pts[1], c2 = pts[pts.length-2], p3 = pts[pts.length-1];
    const evalC = t => ({
      x: (1-t)**3*p0.x + 3*(1-t)**2*t*c1.x + 3*(1-t)*t**2*c2.x + t**3*p3.x,
      y: (1-t)**3*p0.y + 3*(1-t)**2*t*c1.y + 3*(1-t)*t**2*c2.y + t**3*p3.y
    });
    const tan = arrivalTangent(evalC);
    return { d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`,
             ex: p3.x, ey: p3.y, ...tan };
  }

  // ── Pass 2a: draw all paths first ───────────────────────────────────────────
  const connArrowSVGs = [];
  connections.forEach(function(conn, ci) {
    const pts  = allConnPts[ci];
    const meta = allConnMeta[ci];
    if (!pts || !meta) { connArrowSVGs.push(''); return; }
    const col  = conn.color || "#64748b";
    const mid  = col.replace("#", "");
    const dash = conn.dashed ? `stroke-dasharray="6,3"` : "";
    const R    = 9;
    let pathD, arrowSVG = '';
    if (meta.laneSpan > 1) {
      const curve = curvedPathLC(pts, meta.laneSpan);
      pathD = curve.d;
      const angle = Math.atan2(curve.tanY, curve.tanX) * 180 / Math.PI;
      arrowSVG = `<polygon points="0,0 -14,-5 -14,5" fill="${svgEsc(col)}" transform="translate(${curve.ex},${curve.ey}) rotate(${angle})"/>`;
    } else {
      pathD = orthPath(pts, R);
    }
    const labelNearAttr = conn.labelNear ? ` data-label-near="${svgEsc(conn.labelNear)}"` : '';
    svg += `<path id="conn-path-${ci}" d="${pathD}" fill="none" stroke="${svgEsc(col)}" stroke-width="1.8" ${dash}${meta.laneSpan > 1 ? '' : ` marker-end="url(#arr${mid})"`}${labelNearAttr}/>`;
    svg += arrowSVG;
    connArrowSVGs.push('');
  });

  // ── Pass 2b: emit label text stubs — final placement done client-side via getBBox ─
  const connLabelItems = [];
  connections.forEach(function(conn, ci) {
    const pts  = allConnPts[ci];
    const meta = allConnMeta[ci];
    if (!pts || !meta) return;
    const col  = conn.color || "#64748b";

    if (conn.label) {
      // Resolve § refs; suppress any already shown in either connected cell
      const fpkLC = parseKey(conn.from), tpkLC = parseKey(conn.to);
      const fromCellLC = (stages[stages.findIndex(s => String(s.number) === fpkLC.stageNum)]?.cells || {})[fpkLC.laneId];
      const toCellLC   = (stages[stages.findIndex(s => String(s.number) === tpkLC.stageNum)]?.cells || {})[tpkLC.laneId];
      const connectedRefsLC = new Set([...(fromCellLC?.refs || []), ...(toCellLC?.refs || [])]);
      const allLabelRefs = parseLabelParts(conn.label).filter(p => p.refKey).map(p => p.refKey);
      const suppressedRefs = new Set(allLabelRefs.filter(r => refMatchesSet(r, connectedRefsLC)));
      const visibleRefs = allLabelRefs
        .filter(r => !suppressedRefs.has(r))
        .flatMap(r => resolveRefInDefined(r, config.defined))
        .filter((r, i, a) => a.indexOf(r) === i);
      // Rough midpoint for initial text position (client-side will reposition via getBBox)
      const midPt = pts[Math.floor(pts.length / 2)];
      const midX  = midPt ? midPt.x : 0;
      const midY  = midPt ? midPt.y - 10 : 0;
      const idxAttr = visibleRefs.length > 0
        ? ` data-conn-label-idx="${connLabelItems.length}"`
        : '';
      if (visibleRefs.length > 0) connLabelItems.push({ refs: visibleRefs, label: conn.label });
      // Wrap short labels on contiguous same-lane connections (no surviving § refs)
      const isContiguous = meta.sameLane && Math.abs(meta.fromSi - meta.toSi) === 1;
      const hasVisibleRef = parseLabelParts(conn.label).some(p => p.refKey && !suppressedRefs.has(p.refKey));
      const visibleText = labelVisibleText(conn.label, suppressedRefs);
      const segLen = Math.abs(pts[pts.length-1].x - pts[0].x);
      const wrapTarget = Math.max(segLen * 0.88, 55);
      let textContent;
      if (isContiguous && !hasVisibleRef && textW(visibleText, 9.5) > wrapTarget) {
        const words = visibleText.split(' '), lines = [];
        let cur = '';
        words.forEach(function(w) {
          const test = cur ? cur + ' ' + w : w;
          if (cur && textW(test, 9.5) > wrapTarget) { lines.push(cur); cur = w; }
          else cur = test;
        });
        if (cur) lines.push(cur);
        const lineH = 12;
        const startDy = -((lines.length - 1) * lineH) / 2;
        textContent = lines.map(function(l, i) {
          return `<tspan x="${midX}" dy="${i === 0 ? startDy : lineH}">${acroSvgInner(l, effectiveAcronyms)}</tspan>`;
        }).join('');
      } else {
        textContent = labelInnerSvg(conn.label, suppressedRefs, effectiveAcronyms);
      }
      svg += `<text id="conn-label-${ci}" x="${midX}" y="${midY}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${svgEsc(col)}" opacity="0"${idxAttr}>${textContent}</text>`;
    }
  });

  // ── Span banners ──────────────────────────────────────────────────────────
  const spanClickItems = [];
  let sy = cy + SPAN_GAP;
  for (const sp of spans) {
    const bg  = sp.color || borderColor;
    const lbl = sp.label || "";
    const refs= sp.refs || [];
    // Partial span support: fromStage/toStage (stage numbers) clip the bar horizontally.
    // Fall back to full stage area when not specified (colX-aligned, not MARGIN-aligned).
    const fromSi = sp.fromStage != null
      ? stages.findIndex(s => String(s.number) === String(sp.fromStage)) : 0;
    const toSi   = sp.toStage != null
      ? stages.findIndex(s => String(s.number) === String(sp.toStage))   : stages.length - 1;
    const si0 = fromSi >= 0 ? fromSi : 0;
    const si1 = toSi   >= 0 ? toSi   : stages.length - 1;
    const spX = colX(si0) - COL_GAP / 2;
    const spW = colX(si1) + COL_W + COL_GAP / 2 - spX;
    svg += `<rect x="${spX}" y="${sy}" width="${spW}" height="${SPAN_H}" rx="8" fill="${svgEsc(bg)}"/>`;
    svg += `<text x="${spX + 16}" y="${sy + 24}" font-size="11" font-weight="700" fill="#fff">${svgEsc(lbl)}</text>`;
    if (refs.length) {
      svg += `<text x="${spX + spW - 12}" y="${sy + 24}" text-anchor="end" font-size="9" font-style="italic">${refsInnerSvg(refs, config.defined, "rgba(255,255,255,0.7)", "rgba(252,165,165,0.9)")}</text>`;
    }
    if (refs.length) {
      const idx = spanClickItems.length;
      spanClickItems.push({ refs, label: lbl });
      svg += `<rect class="lc-span-click" data-idx="${idx}" x="${spX}" y="${sy}" width="${spW}" height="${SPAN_H}" rx="8" fill="transparent" cursor="pointer" opacity="0"/>`;
    }
    sy += SPAN_H + SPAN_GAP;
  }

  // Assemble full SVG with defs
  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" style="width:100%;max-width:${svgW}px;display:block;margin:0 auto;cursor:default"><defs>${defs}</defs>${svg}</svg>`;

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f4f8;color:#1e293b;padding:16px}
h1{text-align:center;font-size:1.4rem;margin-bottom:4px;color:#0f172a}
.subtitle{text-align:center;font-size:.85rem;color:#64748b;margin-bottom:6px}
.instr-wrap{text-align:center;margin-bottom:20px}
.instr{font-size:.8rem;color:#0369a1;background:#e0f2fe;padding:8px 16px;border-radius:8px;display:inline-block}
.lc-wrap{background:#fff;border-radius:12px;padding:20px 24px 24px;
  box-shadow:0 1px 6px rgba(0,0,0,.07);border-left:5px solid ${borderColor};overflow-x:auto}
.lc-click:hover,.lc-span-click:hover{opacity:0.06 !important;fill:${borderColor} !important}
.lc-conn-click:hover{opacity:0.18 !important;fill:#fff !important}
.lc-annotation-click:hover{opacity:0.25 !important;fill:#f59e0b !important}
${tooltipCss}`.trim();

  // ── JS ────────────────────────────────────────────────────────────────────
  const clickData          = JSON.stringify(clickItems.map(c => ({ refs: c.refs, label: c.label })));
  const annotationData     = JSON.stringify(annotationItems.map(c => ({ text: c.text, name: c.name, color: c.color })));
  const spanClickData      = JSON.stringify(spanClickItems.map(c => ({ refs: c.refs, label: c.label })));
  const connLabelData      = JSON.stringify(connLabelItems.map(c => ({ refs: c.refs, label: c.label })));

  const js = `${tooltipJs}
var lcItems=${clickData};
var lcAnnotations=${annotationData};
var lcSpans=${spanClickData};
var lcConnLabels=${connLabelData};
document.querySelectorAll('.lc-click').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var d=lcItems[+el.dataset.idx];
    if(activeItem===d.label){hide();}else{show(d.refs,d.label,e);}
  });
});
document.querySelectorAll('.lc-annotation-click').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var d=lcAnnotations[+el.dataset.aidx];
    if(activeItem===d.name+'__annotation'){hide();}else{showAnnotation(d.text,d.name,d.color,e);}
  });
});
document.querySelectorAll('.lc-span-click').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var d=lcSpans[+el.dataset.idx];
    if(activeItem===d.label){hide();}else{show(d.refs,d.label,e);}
  });
});
${lcLabelPlacementScript()}`;

  // ── Assemble HTML ─────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)} - 47 CFR References</title>
<style>${css}</style></head>
<body>
${headerHtml}
<div class="lc-wrap">
${fullSvg}
</div>
<script>${js}<\/script>
</body></html>`;

  fs.writeFileSync(outputPath, html, "utf-8");
  const cellCount = stages.reduce((n, st) => n + Object.keys(st.cells || {}).length, 0);
  console.log("\u2713 Generated: " + outputPath);
  console.log("  Layout:      lifecycle");
  console.log("  Lanes:       " + lanes.length);
  console.log("  Stages:      " + stages.length);
  console.log("  Cells:       " + cellCount);
  console.log("  Connections: " + connections.length);
  console.log("  CFR refs:    " + allRefs.size);
  console.log("  SVG size:    " + svgW + " x " + svgH + "px");
}

// ════════════════════════════════════════════════════════════════════════════
// LIFECYCLE-T LAYOUT  —  transposed: lanes = columns, stages = rows
// ════════════════════════════════════════════════════════════════════════════

function buildLifecycleT() {
  const lanes       = config.lanes;
  const stages      = config.stages;
  const spans       = config.spans       || [];
  const connections = config.connections || [];

  // ── Geometry constants ────────────────────────────────────────────────────
  const MARGIN   = 24;
  const SL_W     = 110;   // stage-label row height (left column)
  const SL_GAP   = 44;    // gap between stage label and first lane column
  const COL_W    = 172;   // lane column card width
  const COL_GAP  = 92;    // gap between lane columns (visual breathing room + corridor)
  const LANE_PAD = 12;    // per-side padding on lane stripe background (fixed regardless of gap)
  const HDR_H    = 52;    // lane header row height at top
  const ROW_GAP  = 80;    // outer left/right corridor width (obstacle/backward arrows)
  const STEP_GAP = 44;    // gap between stage rows
  const CP       = 10;    // card horizontal padding & bottom gap
  const CP_TOP   = 3;     // card title-top gap
  const CARD_R   = 7;
  const ITEM_INDENT = 8;
  const SPAN_H   = 38;
  const SPAN_GAP = 8;
  const CHARS    = 20;
  const TH       = 14;
  const IH       = 12;
  const RH       = 11;
  const BADGE_H  = 14;
  const SC_H     = 16;    // owners badge height
  const SLIM     = 40;    // tight gap when outer corridor unused

  // ── Proportional text-width estimator ────────────────────────────────────
  function textW(str, fontSize) {
    if (!str) return 0;
    const scale = fontSize / 10;
    let w = 0;
    for (const ch of str) {
      if (' il|.,;:!\'"§`'.indexOf(ch) >= 0) w += 3.2;
      else if ('fjrt'.indexOf(ch) >= 0)       w += 4.8;
      else if ('MWmw'.indexOf(ch) >= 0)       w += 8.5;
      else if (ch >= 'A' && ch <= 'Z')        w += 7.0;
      else if (ch >= '0' && ch <= '9')        w += 6.0;
      else                                    w += 5.8;
    }
    return w * scale;
  }

  // ── Wrap refs array into lines fitting maxPx at font-size 8.5 ────────────
  function wrapRefs(refs, maxPx) {
    const SEP_W = textW(' · ', 8.5);
    const lines = [], len = refs.length;
    let line = [], lineW = 0;
    for (let i = 0; i < len; i++) {
      const tokW = textW('\u00a7\u00a0' + refs[i], 8.5);
      const needed = line.length ? SEP_W + tokW : tokW;
      if (line.length && lineW + needed > maxPx) {
        lines.push(line); line = [refs[i]]; lineW = tokW;
      } else {
        line.push(refs[i]); lineW += needed;
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  function wrap(text, maxCh) {
    if (!text) return [];
    const words = String(text).split(" ");
    const lines = []; let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (test.length > maxCh && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  const TITLE_MAX_PX = COL_W - 2 * CP;
  function wrapTitle(text) {
    if (!text) return [];
    const words = String(text).split(" ");
    const lines = []; let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (cur && textW(test, 11) > TITLE_MAX_PX) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function cardHeight(cell) {
    if (!cell) return 0;
    let h = CP_TOP;
    const annCount = (cell.annotations || []).length;
    h += annCount * (BADGE_H + 2);
    h += wrapTitle(cell.title || "").length * TH + 4;
    // bannerH+4 gap: rendered when annCount>0 (or always as titleZoneH+4 guard)
    if (annCount > 0) h += 4;
    if (cell.owners) h += SC_H;
    for (const it of (cell.items || [])) {
      const itText = typeof it === "string" ? it : (it.text || "");
      h += wrap(itText, CHARS - 2).length * IH;
      if (typeof it === "object" && it.owner) h += IH;
    }
    if ((cell.items || []).length) h += 4;
    const refs = cell.refs || [];
    if (refs.length) {
      const refLineCount = wrapRefs(refs, COL_W - CP * 2).length;
      h += refLineCount * RH + 4;
    }
    h += CP;
    return Math.max(h, 56);
  }

  // Row heights = max card height across all lanes for that stage
  const rowHeights = stages.map(st =>
    Math.max(...lanes.map(ln => cardHeight((st.cells || {})[ln.id])), 56)
  );

  // Pre-scan connections to determine whether outer corridors (left of lane 0,
  // right of last lane) are actually needed.
  // In transposed layout:
  //   "top corridor" of original = "left corridor" here  (same lane, rightward+obstacle → routes left)
  //   "bottom corridor" of original = "right corridor" here (same lane, backward → routes right)
  const firstLaneId = lanes[0].id;
  const lastLaneId  = lanes[lanes.length - 1].id;

  function connNeedsLeftCorridor(conn) {
    const fLane = conn.from.slice(0, conn.from.lastIndexOf('-'));
    const tLane = conn.to.slice(0, conn.to.lastIndexOf('-'));
    if (fLane !== firstLaneId || tLane !== firstLaneId) return false;
    const fromSnum = conn.from.slice(conn.from.lastIndexOf('-') + 1);
    const toSnum   = conn.to.slice(conn.to.lastIndexOf('-') + 1);
    const fromSi   = stages.findIndex(s => String(s.number) === fromSnum);
    const toSi     = stages.findIndex(s => String(s.number) === toSnum);
    if (toSi <= fromSi) return false;
    return stages.slice(fromSi + 1, toSi).some(st => (st.cells || {})[firstLaneId]);
  }
  function connNeedsRightCorridor(conn) {
    const fLane = conn.from.slice(0, conn.from.lastIndexOf('-'));
    const tLane = conn.to.slice(0, conn.to.lastIndexOf('-'));
    if (fLane !== lastLaneId || tLane !== lastLaneId) return false;
    const fromSnum = conn.from.slice(conn.from.lastIndexOf('-') + 1);
    const toSnum   = conn.to.slice(conn.to.lastIndexOf('-') + 1);
    const fromSi   = stages.findIndex(s => String(s.number) === fromSnum);
    const toSi     = stages.findIndex(s => String(s.number) === toSnum);
    return toSi < fromSi;
  }

  const needsLeft  = connections.some(connNeedsLeftCorridor);
  const needsRight = connections.some(connNeedsRightCorridor);
  const leftGap    = needsLeft  ? COL_GAP : SLIM;
  const rightGap   = needsRight ? COL_GAP : SLIM;

  // Lane column X positions (left edge of card)
  const laneX = [];
  for (let li = 0; li < lanes.length; li++) {
    laneX.push(MARGIN + SL_W + SL_GAP
      + leftGap                        // left corridor (replaces first COL_GAP)
      - COL_GAP                        // cancel default first gap
      + li * (COL_W + COL_GAP));
  }
  // Simpler: lane 0 starts at MARGIN + SL_W + leftGap; subsequent at +COL_W+COL_GAP
  for (let li = 0; li < lanes.length; li++) {
    laneX[li] = MARGIN + SL_W + leftGap + li * (COL_W + COL_GAP);
  }

  // Stage row Y positions (top of card area)
  // Top corridor above row 0 and bottom corridor below last row
  const rowY = [];
  let ry = MARGIN + HDR_H + SLIM;
  for (let si = 0; si < stages.length; si++) {
    rowY.push(ry);
    ry += rowHeights[si] + (si === stages.length - 1 ? SLIM : STEP_GAP);
  }

  // Build cell rect lookup: "laneId-stageNum" → {x, y, w, h, cx, cy}
  const cellRects = {};
  for (let li = 0; li < lanes.length; li++) {
    for (let si = 0; si < stages.length; si++) {
      const key  = `${lanes[li].id}-${stages[si].number}`;
      const cell = (stages[si].cells || {})[lanes[li].id];
      if (cell) {
        const x = laneX[li], y = rowY[si], w = COL_W, h = rowHeights[si];
        cellRects[key] = { x, y, w, h, cx: x + w/2, cy: y + h/2 };
      }
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const allRefs = new Set();
  for (const st of stages)
    for (const cell of Object.values(st.cells || {}))
      for (const r of (cell.refs || [])) allRefs.add(r);
  for (const sp of spans) for (const r of (sp.refs || [])) allRefs.add(r);

  // ── SVG dimensions ────────────────────────────────────────────────────────
  const spansW    = spans.length ? spans.length * (SPAN_H + SPAN_GAP) + SPAN_GAP : 0;
  const rightEdge = laneX[lanes.length - 1] + COL_W + rightGap + spansW + MARGIN;
  const svgW      = rightEdge;
  const svgH      = ry + MARGIN;

  // ── SVG escape ────────────────────────────────────────────────────────────
  function svgEsc(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Build SVG ─────────────────────────────────────────────────────────────
  let svg = "";

  // Background
  svg += `<rect width="${svgW}" height="${svgH}" rx="12" fill="#f0f4f8"/>`;

  // Lane column stripe backgrounds (full height, fixed padding independent of COL_GAP)
  for (let li = 0; li < lanes.length; li++) {
    const lane   = lanes[li];
    const lBgRaw  = lane.stripColor || lane.color || "#f8fafc";
    const lBdrS   = lane.borderColor || "#e2e8f0";
    const stripFill = lane.highlight === true
      ? pastelify(lBgRaw, 0.44)
      : pastelify(lBdrS !== "#e2e8f0" ? lBdrS : borderColor);
    const stripX = laneX[li] - LANE_PAD;
    const stripW = COL_W + LANE_PAD * 2;
    svg += `<rect x="${stripX}" y="0" width="${stripW}" height="${svgH}" fill="${svgEsc(stripFill)}" opacity="0.65"/>`;
  }

  // Zebra shading: alternate stage rows (odd stages shaded)
  for (let si = 0; si < stages.length; si++) {
    if (si % 2 === 0) {
      svg += `<rect x="0" y="${rowY[si] - STEP_GAP/2}" width="${svgW}" height="${rowHeights[si] + STEP_GAP}" fill="#000" opacity="0.018"/>`;
    }
  }

  // Lane header boxes (top row)
  const configDirT = path.dirname(path.resolve(configPath));
  for (let li = 0; li < lanes.length; li++) {
    const lane  = lanes[li];
    const lBg   = lane.color       || "#f8fafc";
    const lTxt  = lane.textColor   || "#334155";
    const lBdr  = lane.borderColor || "#e2e8f0";
    const x = laneX[li], w = COL_W, y = MARGIN, h = HDR_H - 6;
    const isHighlightL = lane.highlight === true;
    const labelSrcT     = lBdr !== "#e2e8f0" ? lBdr : borderColor;
    const labelBoxFillT = isHighlightL ? lBg  : pastelify(labelSrcT, 0.78);
    const labelTxtT     = isHighlightL ? lTxt : darkenHex(labelSrcT, 0.45);
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${svgEsc(labelBoxFillT)}" stroke="${svgEsc(lBdr)}" stroke-width="1.5"/>`;

    const logo = resolveLogoSrc(lane.logo, configDirT);
    const LOGO_SZ = 60;
    if (logo) {
      // Logo left of text, vertically centred in header box.
      const LOGO_PAD = 8;
      const lx = x + LOGO_PAD;
      const ly = y + h / 2 - LOGO_SZ / 2;
      svg += `${logo.url ? `<a href="${svgEsc(logo.url)}" target="_blank" rel="noopener noreferrer">` : ""}<image href="${svgEsc(logo.src)}" x="${lx}" y="${ly}" width="${LOGO_SZ}" height="${LOGO_SZ}" preserveAspectRatio="xMidYMid meet" style="cursor:${logo.url ? "pointer" : "default"}"><title>${svgEsc(logo.alt)}</title></image>${logo.url ? "</a>" : ""}`;
      const textX    = lx + LOGO_SZ + 6;
      const textMaxW = x + w - textX - 4;
      const maxCh    = Math.max(4, Math.floor(textMaxW / 7));
      const lblLines = wrap(lane.label, maxCh);
      const totalH   = lblLines.length * 13;
      const startY   = y + h / 2 - totalH / 2 + 9;
      lblLines.forEach((ln, i) => {
        svg += `<text x="${textX}" y="${startY + i*19}" text-anchor="start" font-size="16" font-weight="700" fill="${svgEsc(labelTxtT)}">${svgEsc(ln)}</text>`;
      });
    } else {
      const lblLines = wrap(lane.label, Math.floor(COL_W / 10.8));
      const totalH   = lblLines.length * 13;
      const startY   = y + h/2 - totalH/2 + 9;
      lblLines.forEach((ln, i) => {
        svg += `<text x="${x + w/2}" y="${startY + i*19}" text-anchor="middle" font-size="16" font-weight="700" fill="${svgEsc(labelTxtT)}">${svgEsc(ln)}</text>`;
      });
    }
  }

  // Stage label boxes (left column)
  for (let si = 0; si < stages.length; si++) {
    const st  = stages[si];
    const y   = rowY[si], h = rowHeights[si];
    svg += `<rect x="${MARGIN}" y="${y}" width="${SL_W}" height="${h}" rx="6" fill="#e2e8f0"/>`;
    svg += `<text x="${MARGIN + SL_W/2}" y="${y + 18}" text-anchor="middle" font-size="18" font-weight="800" fill="${svgEsc(borderColor)}">${svgEsc(st.number)}</text>`;
    const lblLines = wrap(st.label, Math.floor(SL_W / 8.4));
    lblLines.forEach((ln, i) => {
      svg += `<text x="${MARGIN + SL_W/2}" y="${y + 32 + i*14}" text-anchor="middle" font-size="12" font-weight="700" fill="#475569">${svgEsc(ln)}</text>`;
    });
  }

  // ── Cards ─────────────────────────────────────────────────────────────────
  const clickItems      = [];
  const annotationItems = [];

  for (let li = 0; li < lanes.length; li++) {
    const lane        = lanes[li];
    const lBg         = lane.color       || "#f8fafc";
    const lTxt        = lane.textColor   || "#334155";
    const lBdr        = lane.borderColor || "#e2e8f0";
    const isHighlight = lane.highlight === true;
    const labelSrcT   = lBdr !== "#e2e8f0" ? lBdr : borderColor;
    const accent      = isHighlight ? lBg : labelSrcT;

    for (let si = 0; si < stages.length; si++) {
      const st   = stages[si];
      const cell = (st.cells || {})[lane.id];
      if (!cell) continue;

      const x = laneX[li], y = rowY[si], w = COL_W, h = rowHeights[si];
      const annotationsArr = cell.annotations || [];
      const isAnnotated    = annotationsArr.length > 0;
      const refs     = cell.refs || [];
      const titleLines = wrapTitle(cell.title || "");

      const titleZoneH       = CP_TOP + titleLines.length * TH + 6;
      const annotationsZoneH = annotationsArr.length * (BADGE_H + 2);
      const bannerH          = titleZoneH + annotationsZoneH;

      const annotColor     = (annotationsArr[0] && annotationsArr[0].color) || "#fbbf24";
      const cardFill       = isAnnotated ? hexTint(annotColor, 0.18) : "#ffffff";
      const titleBandColor = accent;
      const strokeW        = isAnnotated ? "1.5" : "1";
      const dashArr        = isAnnotated ? `stroke-dasharray="4,3"` : "";
      const cardStroke     = isAnnotated ? "none" : titleBandColor;
      const cellId         = `cell-${lane.id}-${st.number}`;
      svg += `<rect id="${cellId}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${CARD_R}" fill="${cardFill}" stroke="${svgEsc(cardStroke)}" stroke-width="${strokeW}" filter="url(#cs)"/>`;

      svg += `<rect x="${x}" y="${y}" width="${w}" height="${titleZoneH}" rx="${CARD_R}" fill="${svgEsc(titleBandColor)}"/>`;
      svg += `<rect x="${x}" y="${y + titleZoneH - CARD_R}" width="${w}" height="${CARD_R}" fill="${svgEsc(titleBandColor)}"/>`;
      if (isAnnotated) {
        svg += `<path d="M ${x},${y+titleZoneH} L ${x},${y+CARD_R} Q ${x},${y} ${x+CARD_R},${y} L ${x+w-CARD_R},${y} Q ${x+w},${y} ${x+w},${y+CARD_R} L ${x+w},${y+titleZoneH}" fill="none" stroke="${svgEsc(titleBandColor)}" stroke-width="${strokeW}"/>`;
      }

      if (isAnnotated && annotationsZoneH > 0) {
        let ay = y + titleZoneH;
        for (const ann of annotationsArr) {
          const ac = ann.color || "#fbbf24";
          svg += `<rect x="${x}" y="${ay}" width="${w}" height="${BADGE_H + 2}" fill="${svgEsc(ac)}"/>`;
          ay += BADGE_H + 2;
        }
      }

      { const bx=x, by=y+titleZoneH, bw=w, bh=h-titleZoneH, r=CARD_R;
        const bodyStroke = isAnnotated ? annotColor : lBdr;
        const bodyD = `M ${bx},${by} L ${bx},${by+bh-r} Q ${bx},${by+bh} ${bx+r},${by+bh} L ${bx+bw-r},${by+bh} Q ${bx+bw},${by+bh} ${bx+bw},${by+bh-r} L ${bx+bw},${by}`;
        svg += `<path d="${bodyD}" fill="none" stroke="${svgEsc(bodyStroke)}" stroke-width="${strokeW}" ${dashArr}/>`;
      }

      let ty = y + CP_TOP;

      const titleFill = "#ffffff";
      titleLines.forEach((ln, i) => {
        svg += `<text x="${x + CP}" y="${ty + (i+1)*TH}" font-size="11" font-weight="700" fill="${svgEsc(titleFill)}">${acroSvgInner(ln, effectiveAcronyms)}</text>`;
      });
      ty += titleLines.length * TH + 4;
      if (ty < y + titleZoneH) ty = y + titleZoneH;

      for (const ann of annotationsArr) {
        const ac = ann.color || "#fbbf24";
        const hex = ac.replace("#","");
        const [rl, gl, bl] = [hex.slice(0,2), hex.slice(2,4), hex.slice(4,6)]
          .map(h => { const s = parseInt(h,16)/255; return s <= 0.04045 ? s/12.92 : ((s+0.055)/1.055)**2.4; });
        const lum = 0.2126*rl + 0.7152*gl + 0.0722*bl;
        const badgeFill = lum < 0.35 ? "#ffffff" : "#78350f";
        svg += `<text x="${x + CP}" y="${ty + BADGE_H - 3}" font-size="9" font-weight="700" fill="${svgEsc(badgeFill)}">${svgEsc(ann.label || "")}</text>`;
        if (ann.text) {
          const ai = annotationItems.length;
          annotationItems.push({ text: ann.text, name: ann.label || "", color: ac });
          svg += `<rect class="lc-annotation-click" data-aidx="${ai}" x="${x}" y="${ty - 2}" width="${w}" height="${BADGE_H + 4}" rx="3" fill="transparent" cursor="pointer" opacity="0"/>`;
        }
        ty += BADGE_H + 2;
      }

      // Ensure items/pill start below the full banner (title + annotations)
      if (ty < y + bannerH + 4) ty = y + bannerH + 4;

      // Subcomponent badge — pill below the band, on white body
      if (cell.owners) {
        const scTxt = cell.owners;
        const scPx = 6;
        const scW = Math.min(scTxt.length * 6.5 + scPx * 2, w - CP * 2);
        svg += `<rect x="${x + CP}" y="${ty}" width="${scW}" height="${SC_H - 2}" rx="${(SC_H-2)/2}" fill="${hexToRgba(accent, 0.13)}"/>`;
        svg += `<text x="${x + CP + scPx}" y="${ty + SC_H - 6}" font-size="8" font-weight="700" fill="${svgEsc(accent)}">${svgEsc(scTxt)}</text>`;
        ty += SC_H;
      }

      for (const it of (cell.items || [])) {
        const itText = typeof it === "string" ? it : (it.text || "");
        const itDept = typeof it === "object" ? (it.owner || null) : null;
        const itLines = wrap(itText, CHARS - 2);
        svg += `<text x="${x + CP}" y="${ty + IH}" font-size="9" fill="#475569">&#x2022;</text>`;
        itLines.forEach((ln, i) => {
          svg += `<text x="${x + CP + ITEM_INDENT}" y="${ty + (i+1)*IH}" font-size="9" fill="#475569">${acroSvgInner(ln, effectiveAcronyms)}</text>`;
        });
        ty += itLines.length * IH;
        if (itDept) {
          svg += `<text x="${x + CP + ITEM_INDENT}" y="${ty + IH}" font-size="7.5" fill="#94a3b8" font-style="italic">${svgEsc("— " + itDept)}</text>`;
          ty += IH;
        }
      }
      if ((cell.items || []).length) ty += 4;

      if (refs.length) {
        const refLines = wrapRefs(refs, w - CP * 2);
        refLines.forEach(function(lineRefs, li) {
          svg += `<text x="${x + CP}" y="${ty + RH + li * RH}" font-size="8.5" font-style="italic">${refsInnerSvg(lineRefs, config.defined, "#94a3b8", "#f87171")}</text>`;
        });
      }

      if (refs.length) {
        const idx = clickItems.length;
        const headerH = titleZoneH + annotationsZoneH;
        const oy = y + headerH;
        const oh = h - headerH;
        clickItems.push({ refs, label: cell.title || "" });
        svg += `<rect class="lc-click" data-idx="${idx}" x="${x}" y="${oy}" width="${w}" height="${oh}" rx="${CARD_R}" fill="transparent" cursor="pointer" opacity="0"/>`;
      }
    }
  }

  // ── Arrows ── orthogonal router (transposed geometry) ─────────────────────
  const arrowColors = new Set(connections.map(c => c.color || "#64748b"));
  let defs = `<filter id="cs" x="-2%" y="-4%" width="104%" height="108%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-opacity="0.10"/></filter><filter id="as" x="-8%" y="-8%" width="116%" height="116%"><feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="#000" flood-opacity="0.38"/></filter>`;
  for (const col of arrowColors) {
    const mid = col.replace("#","");
    defs += `<marker id="arr${mid}" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5 Z" fill="${svgEsc(col)}"/></marker>`;
  }

  function parseKey(key) {
    const dash = key.indexOf('-');
    return { laneId: key.slice(0, dash), stageNum: key.slice(dash + 1) };
  }

  function orthPath(pts, R) {
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i-1], cur = pts[i], next = i < pts.length-1 ? pts[i+1] : null;
      if (!next) { d += ` L${cur.x},${cur.y}`; continue; }
      const dx1=cur.x-prev.x, dy1=cur.y-prev.y;
      const dx2=next.x-cur.x, dy2=next.y-cur.y;
      const len1=Math.sqrt(dx1*dx1+dy1*dy1), len2=Math.sqrt(dx2*dx2+dy2*dy2);
      const r=Math.min(R, len1/2, len2/2);
      const bx=cur.x-r*dx1/len1, by=cur.y-r*dy1/len1;
      const ax=cur.x+r*dx2/len2, ay=cur.y+r*dy2/len2;
      d += ` L${bx},${by} Q${cur.x},${cur.y} ${ax},${ay}`;
    }
    return d;
  }

  // ── Pre-pass: edge selection and spread slots (transposed geometry) ─────────
  // In lifecycle-t: same-lane = same column = connections travel vertically
  //   → use top/bottom edges, spread attachment along X
  // Cross-lane same-stage = same row = connections travel horizontally
  //   → use right/left edges, spread attachment along Y

  // Pre-scan: for same-lane obstacle connections in LCT, same-lane = same column.
  // goingDown+obstacle routes LEFT; goingUp+obstacle routes RIGHT. Count committed
  // corridor loads and assign goingDown connections to the less-loaded side.
  const corrChoiceT = {};
  {
    const _leftCor  = lanes.map(() => 0);
    const _rightCor = lanes.map(() => 0);
    function baseInfoT(conn) {
      const fr = cellRects[conn.from], to = cellRects[conn.to];
      if (!fr || !to) return null;
      const fpk = parseKey(conn.from), tpk = parseKey(conn.to);
      const fromLi = lanes.findIndex(l => l.id === fpk.laneId);
      const toLi   = lanes.findIndex(l => l.id === tpk.laneId);
      const fromSi = stages.findIndex(s => String(s.number) === fpk.stageNum);
      const toSi   = stages.findIndex(s => String(s.number) === tpk.stageNum);
      return { fromLi, toLi, fromSi, toSi,
               sameLane: fromLi === toLi,
               goingDown: toSi > fromSi,
               goingRight: toLi > fromLi };
    }
    // Pass A: commit fixed-corridor connections
    connections.forEach(function(conn) {
      const b = baseInfoT(conn);
      if (!b) return;
      const { fromLi, toLi, fromSi, toSi, sameLane, goingDown, goingRight } = b;
      if (sameLane) {
        const li = fromLi;
        const lo = Math.min(fromSi, toSi), hi = Math.max(fromSi, toSi);
        const hasObs = stages.slice(lo+1, hi).some(st => (st.cells||{})[lanes[li].id]);
        if (hasObs && !goingDown) _rightCor[li]++;  // backward (up) → always right
      } else if (fromSi !== toSi && Math.abs(fromLi - toLi) === 1) {
        // Span-1 cross-lane different-stage connections route through the inter-lane
        // gapX — which is the LEFT corridor of fromLane when going left (toLi < fromLi)
        // and the RIGHT corridor when going right. Count these so same-lane obstacle
        // connections are pushed to the less occupied side.
        if (goingRight) _rightCor[fromLi]++;
        else            _leftCor[fromLi]++;
      }
    });
    // Pass B: greedily assign same-lane goingDown obstacle connections
    connections.forEach(function(conn, ci) {
      const b = baseInfoT(conn);
      if (!b) return;
      const { fromLi, fromSi, toSi, sameLane, goingDown } = b;
      if (!sameLane) return;
      const li = fromLi;
      const lo = Math.min(fromSi, toSi), hi = Math.max(fromSi, toSi);
      const hasObs = stages.slice(lo+1, hi).some(st => (st.cells||{})[lanes[li].id]);
      if (!hasObs || !goingDown) return;
      if (_leftCor[li] <= _rightCor[li]) { corrChoiceT[ci] = 'left';  _leftCor[li]++; }
      else                               { corrChoiceT[ci] = 'right'; _rightCor[li]++; }
    });
  }

  function getEdgesT(conn, ci) {
    const fr = cellRects[conn.from], to = cellRects[conn.to];
    if (!fr || !to) return null;
    const fpk    = parseKey(conn.from), tpk = parseKey(conn.to);
    const fromLi = lanes.findIndex(l => l.id === fpk.laneId);
    const toLi   = lanes.findIndex(l => l.id === tpk.laneId);
    const fromSi = stages.findIndex(s => String(s.number) === fpk.stageNum);
    const toSi   = stages.findIndex(s => String(s.number) === tpk.stageNum);
    const sameLane   = fromLi === toLi;
    const goingDown  = toSi > fromSi;
    const goingRight = toLi > fromLi;
    let fromEdge, toEdge;
    if (sameLane) {
      const lo = Math.min(fromSi,toSi), hi = Math.max(fromSi,toSi);
      const hasObs = stages.slice(lo+1,hi).some(st => (st.cells||{})[lanes[fromLi].id]);
      if (!hasObs && goingDown)  { fromEdge="bottom"; toEdge="top"; }
      else if (goingDown)        { fromEdge="bottom"; toEdge="top"; }  // obstacle routes left
      else                       { fromEdge="top";    toEdge="bottom"; } // backward routes right
    } else {
      fromEdge = goingRight ? "right" : "left";
      toEdge   = goingRight ? "left"  : "right";
    }
    return { fromEdge, toEdge, fromLi, toLi, fromSi, toSi, sameLane, goingDown, goingRight };
  }

  const edgeSlotsT = {};
  connections.forEach(function(conn, ci) {
    const e = getEdgesT(conn, ci);
    if (!e) return;
    const fk = conn.from + "-" + e.fromEdge;
    const tk = conn.to   + "-" + e.toEdge;
    (edgeSlotsT[fk] = edgeSlotsT[fk] || []).push(ci);
    (edgeSlotsT[tk] = edgeSlotsT[tk] || []).push(ci);
  });

  // For top/bottom edges, sort slots by effective travel-x so attachment points
  // are assigned left-to-right matching the direction of travel — preventing crossings.
  // Effective x: obstacle-left routes → laneX[li]-corridor (very left);
  //              straight down/up     → card cx;
  //              cross-lane           → target cx.
  function effectiveX(ci) {
    const conn = connections[ci];
    const e = getEdgesT(conn, ci);
    if (!e) return 0;
    const { fromLi, fromSi, toSi, sameLane, goingDown, goingRight } = e;
    const fr = cellRects[conn.from], to = cellRects[conn.to];
    if (!fr) return 0;
    if (sameLane) {
      const lo = Math.min(fromSi, toSi), hi = Math.max(fromSi, toSi);
      const hasObs = stages.slice(lo+1,hi).some(st => (st.cells||{})[lanes[fromLi].id]);
      if (hasObs && goingDown) {
        const useLeft = corrChoiceT[ci] !== 'right';
        return useLeft
          ? laneX[fromLi] - COL_GAP * 0.6
          : laneX[fromLi] + COL_W + COL_GAP * 0.6;
      }
      if (hasObs && !goingDown) return laneX[fromLi] + COL_W + COL_GAP * 0.6;
      return fr.cx;
    }
    return to ? to.cx : fr.cx;
  }
  // For left/right edges, sort by laneSpan ASCENDING so the connection with the
  // largest downward bow (highest laneSpan) gets the lowest (highest Y) attachment
  // point — matching where the arc actually lands without crossing straighter lines.
  function laneSpanOf(ci) {
    const conn = connections[ci];
    const e = getEdgesT(conn, ci);
    if (!e) return 0;
    return e.sameLane ? 0 : Math.abs(e.fromLi - e.toLi);
  }
  Object.keys(edgeSlotsT).forEach(function(key) {
    if (key.endsWith('-bottom') || key.endsWith('-top')) {
      edgeSlotsT[key].sort(function(a, b) { return effectiveX(a) - effectiveX(b); });
    } else if (key.endsWith('-left') || key.endsWith('-right')) {
      // Primary: laneSpan ascending (straighter arcs get nearer slots).
      // Secondary tiebreaker: other-endpoint stage index ascending so connections
      // arriving from above get upper Y slots and those from below get lower Y slots,
      // matching where the bowed arc actually lands and preventing crossings.
      const cellKey2 = key.replace(/-(left|right)$/, '');
      const cellSi = stages.findIndex(s => String(s.number) === parseKey(cellKey2).stageNum);
      function otherSi(ci) {
        const conn = connections[ci];
        const otherKey = conn.from === cellKey2 ? conn.to : conn.from;
        return stages.findIndex(s => String(s.number) === parseKey(otherKey).stageNum);
      }
      edgeSlotsT[key].sort(function(a, b) {
        const spanDiff = laneSpanOf(a) - laneSpanOf(b);
        if (spanDiff !== 0) return spanDiff;
        return otherSi(a) - otherSi(b);
      });
    }
  });

  // Spread attachment on an edge — for top/bottom spread along X; for right/left spread along Y
  function attachT(cellKey, edge, ci) {
    const rect  = cellRects[cellKey];
    const slots = edgeSlotsT[cellKey + "-" + edge] || [];
    const n     = slots.length;
    const pos   = slots.indexOf(ci);
    const frac  = n <= 1 ? 0.5 : (pos + 1) / (n + 1);
    const offset = (frac - 0.5) * 0.6;
    if (edge === "bottom") return { x: rect.cx + offset * rect.w, y: rect.y + rect.h };
    if (edge === "top")    return { x: rect.cx + offset * rect.w, y: rect.y            };
    if (edge === "right")  return { x: rect.x + rect.w,           y: rect.cy + offset * rect.h };
    /* left */             return { x: rect.x,                    y: rect.cy + offset * rect.h };
  }

  // ── Pass 1: compute all pts ───────────────────────────────────────────────
  const allConnPts  = [];
  const allConnMeta = [];  // {laneSpan}
  connections.forEach(function(conn, ci) {
    const fr = cellRects[conn.from], to = cellRects[conn.to];
    if (!fr || !to) { allConnPts.push(null); allConnMeta.push(null); return; }
    const e = getEdgesT(conn, ci);
    if (!e) { allConnPts.push(null); allConnMeta.push(null); return; }
    const { fromEdge, toEdge, fromLi, toLi, fromSi, toSi, sameLane, goingDown, goingRight } = e;

    const ap1 = attachT(conn.from, fromEdge, ci);
    const ap2 = attachT(conn.to,   toEdge,   ci);

    let pts;

    if (sameLane) {
      const li = fromLi;
      const lo = Math.min(fromSi, toSi), hi = Math.max(fromSi, toSi);
      const hasObs = stages.slice(lo+1, hi).some(st => (st.cells||{})[lanes[li].id]);

      if (!hasObs) {
        // No obstacle — straight vertical. Force ap2.x = ap1.x so line is perfectly vertical.
        pts = [ ap1, { x: ap1.x, y: ap2.y } ];
      } else if (goingDown) {
        // Obstacle going down: route through the less-crowded corridor (left or right)
        const useLeft = corrChoiceT[ci] !== 'right';
        const corridorX = useLeft
          ? laneX[li] - COL_GAP * 0.6
          : laneX[li] + COL_W + COL_GAP * 0.6;
        pts = [ ap1, { x: ap1.x,     y: ap1.y + STEP_GAP*0.45 },
                     { x: corridorX, y: ap1.y + STEP_GAP*0.45 },
                     { x: corridorX, y: ap2.y - STEP_GAP*0.45 },
                     { x: ap2.x,     y: ap2.y - STEP_GAP*0.45 }, ap2 ];
      } else {
        // Obstacle going up (backward): route RIGHT of the lane column
        const rightX = laneX[li] + COL_W + COL_GAP * 0.6;
        pts = [ ap1, { x: ap1.x, y: ap1.y - STEP_GAP*0.45 },
                { x: rightX, y: ap1.y - STEP_GAP*0.45 },
                { x: rightX, y: ap2.y + STEP_GAP*0.45 },
                { x: ap2.x, y: ap2.y + STEP_GAP*0.45 }, ap2 ];
      }
    } else if (fromSi === toSi) {
      // Same stage row, different lane column.
      // Adjacent lanes (laneSpan=1): force ap2.y = ap1.y for a perfectly horizontal line.
      // Non-adjacent lanes (laneSpan>1): keep independent spread positions for bezier curve.
      const span = Math.abs(fromLi - toLi);
      pts = span === 1 ? [ ap1, { x: ap2.x, y: ap1.y } ] : [ ap1, ap2 ];
    } else {
      // Different lane AND different stage.
      // Adjacent lanes (laneSpan=1): L-shape through inter-row gap.
      // Non-adjacent lanes (laneSpan>1): direct [ap1, ap2] so curvedPathLCT renders a
      // smooth perpendicular-bow quadratic arc (horizontal-connection feel).
      const span = Math.abs(fromLi - toLi);
      if (span === 1) {
        // Route through inter-lane column gap so the line departs/arrives horizontally
        const gapX = goingRight
          ? laneX[fromLi] + COL_W + COL_GAP / 2
          : laneX[fromLi] - COL_GAP / 2;
        pts = [ ap1, { x: gapX, y: ap1.y }, { x: gapX, y: ap2.y }, ap2 ];
      } else {
        pts = [ ap1, ap2 ];
      }
    }
    const laneSpan = sameLane ? 0 : Math.abs(fromLi - toLi);
    allConnPts.push(pts);
    allConnMeta.push({ laneSpan, fromSi, toSi, sameLane });
  });

  // Bezier path for non-contiguous cross-lane connections (bow downward for horizontal travel — perpendicular to travel, matching the rightward bow in lifecycle).
  // Returns { d, ex, ey, tanX, tanY } — arrival tangent sampled at ~ARROW_LEN arc-length
  // back from the endpoint so the arrowhead polygon is oriented to the line angle at the
  // base of the head, not the degenerate tangent at the very tip.
  function curvedPathLCT(pts, laneSpan) {
    const BOW = laneSpan * 22;
    const ARROW_LEN = 14;
    function arrivalTangent(evalFn) {
      // Tip tangent: direction at the very end (tiny step back from t=1)
      const tip = evalFn(1), near = evalFn(1 - 1/60);
      const tipTanX = tip.x - near.x, tipTanY = tip.y - near.y;
      // Base tangent: direction at ~ARROW_LEN arc-length back from endpoint
      const STEPS = 60;
      let prevX = tip.x, prevY = tip.y, cum = 0;
      let baseTanX = tipTanX, baseTanY = tipTanY;
      for (let i = 1; i <= STEPS; i++) {
        const t = 1 - i / STEPS;
        const pt = evalFn(t);
        cum += Math.sqrt((prevX-pt.x)**2 + (prevY-pt.y)**2);
        if (cum >= ARROW_LEN || i === STEPS) {
          baseTanX = prevX - pt.x; baseTanY = prevY - pt.y;
          break;
        }
        prevX = pt.x; prevY = pt.y;
      }
      // Average the two angles for a balanced orientation
      return { tanX: tipTanX + baseTanX, tanY: tipTanY + baseTanY };
    }
    if (pts.length === 2) {
      const p0 = pts[0], p1 = pts[1];
      const mx = (p0.x + p1.x) / 2 + BOW, my = (p0.y + p1.y) / 2;
      const evalQ = t => ({
        x: (1-t)*(1-t)*p0.x + 2*(1-t)*t*mx + t*t*p1.x,
        y: (1-t)*(1-t)*p0.y + 2*(1-t)*t*my + t*t*p1.y
      });
      const tan = arrivalTangent(evalQ);
      return { d: `M${p0.x},${p0.y} Q${mx},${my} ${p1.x},${p1.y}`,
               ex: p1.x, ey: p1.y, ...tan };
    }
    const p0 = pts[0], c1 = pts[1], c2 = pts[pts.length-2], p3 = pts[pts.length-1];
    const evalC = t => ({
      x: (1-t)**3*p0.x + 3*(1-t)**2*t*c1.x + 3*(1-t)*t**2*c2.x + t**3*p3.x,
      y: (1-t)**3*p0.y + 3*(1-t)**2*t*c1.y + 3*(1-t)*t**2*c2.y + t**3*p3.y
    });
    const tan = arrivalTangent(evalC);
    return { d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`,
             ex: p3.x, ey: p3.y, ...tan };
  }

  // ── Pass 2a: draw all paths first ────────────────────────────────────────
  connections.forEach(function(conn,ci){
    const pts=allConnPts[ci];
    const meta=allConnMeta[ci];
    if(!pts||!meta)return;
    const col=conn.color||"#64748b";
    const mid=col.replace("#","");
    const dash=conn.dashed?`stroke-dasharray="6,3"`:"";
    let pathD,arrowSVG='';
    if(meta.laneSpan>1){
      const curve=curvedPathLCT(pts,meta.laneSpan);
      pathD=curve.d;
      const angle=Math.atan2(curve.tanY,curve.tanX)*180/Math.PI;
      arrowSVG=`<polygon points="0,0 -14,-5 -14,5" fill="${svgEsc(col)}" transform="translate(${curve.ex},${curve.ey}) rotate(${angle})"/>`;
    }else{
      pathD=orthPath(pts,9);
    }
    const labelNearAttr=conn.labelNear?` data-label-near="${svgEsc(conn.labelNear)}"`:'' ;
    svg+=`<path id="conn-path-${ci}" d="${pathD}" fill="none" stroke="${svgEsc(col)}" stroke-width="1.8" ${dash}${meta.laneSpan>1?'':` marker-end="url(#arr${mid})"`}${labelNearAttr}/>`;
    svg+=arrowSVG;
  });

  // ── Pass 2b: emit label text stubs — final placement done client-side via getBBox ─
  const connLabelItems=[];
  connections.forEach(function(conn,ci){
    const pts=allConnPts[ci];
    const meta=allConnMeta[ci];
    if(!pts||!meta)return;
    const col=conn.color||"#64748b";

    if(conn.label){
      const fpkLT=parseKey(conn.from),tpkLT=parseKey(conn.to);
      const fromCellLT=(stages[stages.findIndex(s=>String(s.number)===fpkLT.stageNum)]?.cells||{})[fpkLT.laneId];
      const toCellLT  =(stages[stages.findIndex(s=>String(s.number)===tpkLT.stageNum)]?.cells||{})[tpkLT.laneId];
      const connectedRefsLT=new Set([...(fromCellLT?.refs||[]),...(toCellLT?.refs||[])]);
      const allLabelRefs=parseLabelParts(conn.label).filter(p=>p.refKey).map(p=>p.refKey);
      const suppressedRefs=new Set(allLabelRefs.filter(r=>refMatchesSet(r,connectedRefsLT)));
      const visibleRefs=allLabelRefs
        .filter(r=>!suppressedRefs.has(r))
        .flatMap(r=>resolveRefInDefined(r,config.defined))
        .filter((r,i,a)=>a.indexOf(r)===i);
      const midPt=pts[Math.floor(pts.length/2)];
      const midX=midPt?midPt.x:0;
      const midY=midPt?midPt.y-10:0;
      const idxAttr=visibleRefs.length>0?` data-conn-label-idx="${connLabelItems.length}"`:'';
      if(visibleRefs.length>0)connLabelItems.push({refs:visibleRefs,label:conn.label});
      // Wrap short labels on contiguous adjacent-lane same-stage connections (no surviving § refs)
      const isContiguous=!meta.sameLane&&meta.laneSpan===1&&meta.fromSi===meta.toSi;
      const hasVisibleRef=parseLabelParts(conn.label).some(p=>p.refKey&&!suppressedRefs.has(p.refKey));
      const visibleText=labelVisibleText(conn.label,suppressedRefs);
      const segLen=Math.abs(pts[pts.length-1].x-pts[0].x);
      const wrapTarget=Math.max(segLen*0.88,55);
      let textContent;
      if(isContiguous&&!hasVisibleRef&&textW(visibleText,9.5)>wrapTarget){
        const words=visibleText.split(' '),lines=[];
        let cur='';
        words.forEach(function(w){
          const test=cur?cur+' '+w:w;
          if(cur&&textW(test,9.5)>wrapTarget){lines.push(cur);cur=w;}
          else cur=test;
        });
        if(cur)lines.push(cur);
        const lineH=12;
        const startDy=-((lines.length-1)*lineH)/2;
        textContent=lines.map(function(l,i){
          return`<tspan x="${midX}" dy="${i===0?startDy:lineH}">${acroSvgInner(l,effectiveAcronyms)}</tspan>`;
        }).join('');
      }else{
        textContent=labelInnerSvg(conn.label,suppressedRefs,effectiveAcronyms);
      }
      svg+=`<text id="conn-label-${ci}" x="${midX}" y="${midY}" text-anchor="middle" font-size="9.5" font-weight="700" fill="${svgEsc(col)}" opacity="0"${idxAttr}>${textContent}</text>`;
    }
  });

  // ── Span banners — vertical bars to the right of the last lane, spanning stage rows ──
  const spanClickItems = [];
  let sx = laneX[lanes.length - 1] + COL_W + leftGap;
  for (const sp of spans) {
    const bg = sp.color||borderColor, lbl=sp.label||"", refs=sp.refs||[];
    // Partial span support: fromStage/toStage (stage numbers) clip the bar vertically.
    // Fall back to full stage extent (rowY-aligned) when not specified.
    const fromSiT = sp.fromStage != null
      ? stages.findIndex(s => String(s.number) === String(sp.fromStage)) : 0;
    const toSiT   = sp.toStage != null
      ? stages.findIndex(s => String(s.number) === String(sp.toStage))   : stages.length - 1;
    const si0 = fromSiT >= 0 ? fromSiT : 0;
    const si1 = toSiT   >= 0 ? toSiT   : stages.length - 1;
    const spY = rowY[si0] - STEP_GAP / 2;
    const spH = rowY[si1] + rowHeights[si1] + STEP_GAP / 2 - spY;
    svg+=`<rect x="${sx}" y="${spY}" width="${SPAN_H}" height="${spH}" rx="8" fill="${svgEsc(bg)}"/>`;
    const lx = sx + SPAN_H/2, ly = spY + spH/2;
    svg+=`<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="#fff" transform="rotate(90,${lx},${ly})">${svgEsc(lbl)}</text>`;
    if(refs.length){
      const refTxt=refs.map(r=>"\u00a7\u00a0"+r).join(" \u00b7 ");
      svg+=`<text x="${lx}" y="${ly + 12}" text-anchor="end" font-size="8" font-style="italic" transform="rotate(90,${lx},${ly + 12})">${refsInnerSvg(refs, config.defined, "rgba(255,255,255,0.75)", "rgba(252,165,165,0.9)")}</text>`;
    }
    if(refs.length){
      const idx=spanClickItems.length;
      spanClickItems.push({refs,label:lbl});
      svg+=`<rect class="lc-span-click" data-idx="${idx}" x="${sx}" y="${spY}" width="${SPAN_H}" height="${spH}" rx="8" fill="transparent" cursor="pointer" opacity="0"/>`;
    }
    sx+=SPAN_H+SPAN_GAP;
  }

  const fullSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" style="width:100%;max-width:${svgW}px;display:block;margin:0 auto;cursor:default"><defs>${defs}</defs>${svg}</svg>`;

  const css=`
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f4f8;color:#1e293b;padding:16px}
h1{text-align:center;font-size:1.4rem;margin-bottom:4px;color:#0f172a}
.subtitle{text-align:center;font-size:.85rem;color:#64748b;margin-bottom:6px}
.instr-wrap{text-align:center;margin-bottom:20px}
.instr{font-size:.8rem;color:#0369a1;background:#e0f2fe;padding:8px 16px;border-radius:8px;display:inline-block}
.lc-wrap{background:#fff;border-radius:12px;padding:20px 24px 24px;
  box-shadow:0 1px 6px rgba(0,0,0,.07);border-left:5px solid ${borderColor};overflow-x:auto}
.lc-click:hover,.lc-span-click:hover{opacity:0.06 !important;fill:${borderColor} !important}
.lc-conn-click:hover{opacity:0.18 !important;fill:#fff !important}
.lc-annotation-click:hover{opacity:0.25 !important;fill:#f59e0b !important}
${tooltipCss}`.trim();

  const clickData=JSON.stringify(clickItems.map(c=>({refs:c.refs,label:c.label})));
  const annotationData=JSON.stringify(annotationItems.map(c=>({text:c.text,name:c.name,color:c.color})));
  const spanClickData=JSON.stringify(spanClickItems.map(c=>({refs:c.refs,label:c.label})));
  const connLabelData=JSON.stringify(connLabelItems.map(c=>({refs:c.refs,label:c.label})));
  const js=`${tooltipJs}
var lcItems=${clickData};
var lcAnnotations=${annotationData};
var lcSpans=${spanClickData};
var lcConnLabels=${connLabelData};
document.querySelectorAll('.lc-click').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var d=lcItems[+el.dataset.idx];
    if(activeItem===d.label){hide();}else{show(d.refs,d.label,e);}
  });
});
document.querySelectorAll('.lc-annotation-click').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var d=lcAnnotations[+el.dataset.aidx];
    if(activeItem===d.name+'__annotation'){hide();}else{showAnnotation(d.text,d.name,d.color,e);}
  });
});
document.querySelectorAll('.lc-span-click').forEach(function(el){
  el.addEventListener('click',function(e){
    e.stopPropagation();
    var d=lcSpans[+el.dataset.idx];
    if(activeItem===d.label){hide();}else{show(d.refs,d.label,e);}
  });
});
${lcLabelPlacementScript()}`

  const html=`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)} - 47 CFR References</title>
<style>${css}</style></head>
<body>
${headerHtml}
<div class="lc-wrap">
${fullSvg}
</div>
<script>${js}<\/script>
</body></html>`;

  fs.writeFileSync(outputPath, html, "utf-8");
  const cellCount=stages.reduce((n,st)=>n+Object.keys(st.cells||{}).length,0);
  console.log("\u2713 Generated: "+outputPath);
  console.log("  Layout:      lifecycle-t");
  console.log("  Lanes:       "+lanes.length);
  console.log("  Stages:      "+stages.length);
  console.log("  Cells:       "+cellCount);
  console.log("  Connections: "+connections.length);
  console.log("  CFR refs:    "+allRefs.size);
  console.log("  SVG size:    "+svgW+" x "+svgH+"px");
}

// ── buildMermaid() — Mermaid-based layouts (flowchart/sequence/state/gantt) ──

function buildMermaid() {
  // Inject todayMarker off for gantt if not requested
  let mmd = mermaidContent;
  if (layout === "gantt" && !config.todayMarker) {
    const lines = mmd.split("\n");
    lines.splice(1, 0, "    todayMarker off");
    mmd = lines.join("\n");
  }

  const title       = config.title;
  const subtitle    = config.subtitle || "";
  const borderColor = config.borderColor || "#3b82f6";

  // ── CSS ──────────────────────────────────────────────────────────────────
  const sharedCss = `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f4f8;color:#1e293b;padding:16px}
h1{text-align:center;font-size:1.4rem;margin-bottom:4px;color:#0f172a}
.subtitle{text-align:center;font-size:.85rem;color:#64748b;margin-bottom:6px}
.instr-wrap{text-align:center;margin-bottom:14px}
.instr{font-size:.8rem;color:#0369a1;background:#e0f2fe;padding:8px 16px;border-radius:8px;display:inline-block}
.diagram-wrap{background:#fff;border-radius:12px;padding:16px 20px;box-shadow:0 1px 6px rgba(0,0,0,.07);border-left:5px solid}
.mermaid{display:flex;justify-content:center;overflow-x:auto;padding:0}
.mermaid svg{display:block}
a.cfr-link{color:inherit;text-decoration:underline dotted currentColor;text-underline-offset:2px;cursor:pointer}
a.cfr-link:hover{text-decoration:underline currentColor}`;

  const ttCss = `#tt{display:none;position:fixed;z-index:9999;background:#0f172a;color:#e2e8f0;border-radius:10px;padding:14px 18px;max-width:500px;min-width:260px;font-size:.82rem;line-height:1.55;box-shadow:0 8px 30px rgba(0,0,0,.3);pointer-events:auto;user-select:text;-webkit-user-select:text}
#tt .th{font-weight:700;color:#38bdf8;margin-bottom:8px;font-size:.88rem;border-bottom:1px solid #334155;padding-bottom:6px;display:flex;justify-content:space-between;align-items:center}
#tt .close-btn{cursor:pointer;color:#94a3b8;font-size:1.1rem;padding:0 4px;border:none;background:none;line-height:1}
#tt .close-btn:hover{color:#fff}
#tt .ts{margin-bottom:10px}
#tt .ts:last-child{margin-bottom:0}
#tt .tr{font-weight:600;color:#7dd3fc}
#tt .tx{color:#cbd5e1;margin-top:2px}`;

  const legendCss = `.legend{background:#fff;border-radius:10px;padding:10px 16px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.06);font-size:.82rem;color:#475569;display:flex;gap:20px;flex-wrap:wrap;align-items:center}
.li{display:flex;align-items:center;gap:6px}
.ls{width:14px;height:14px;border-radius:3px;flex-shrink:0}`;

  const phaseCardCss = `.phase-panel{max-width:1100px;margin:20px auto 0;padding:0 4px}
.phase-panel-title{font-size:1.1rem;font-weight:700;text-align:center;margin-bottom:4px;color:#0f172a}
.phase-panel-sub{text-align:center;font-size:.8rem;color:#64748b;margin-bottom:20px}
.phase-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.phase-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer;transition:border-color .15s,box-shadow .15s;overflow:hidden}
.phase-card:hover{border-color:#3b82f6;box-shadow:0 2px 12px rgba(59,130,246,.12)}
.pc-head{padding:12px 16px 8px;display:flex;align-items:baseline;gap:10px;border-bottom:1px solid #f1f5f9}
.pc-num{font-size:1.25rem;font-weight:800;color:#3b82f6;line-height:1}
.pc-name{font-size:.88rem;font-weight:700;color:#0f172a}
.pc-body{padding:10px 16px 14px}
.pc-desc{font-size:.78rem;color:#64748b;line-height:1.5;margin-bottom:6px}
.pc-refs{font-size:.72rem;color:#3b82f6;font-weight:700;letter-spacing:.3px}
.pc-arrow{float:right;font-size:.75rem;color:#cbd5e1;margin-top:2px;transition:color .15s}
.phase-card:hover .pc-arrow{color:#3b82f6}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;justify-content:center;align-items:center;padding:24px}
.modal-overlay.active{display:flex}
.modal{background:#fff;border-radius:12px;max-width:680px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);animation:modalIn .15s ease}
@keyframes modalIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.modal-head{position:sticky;top:0;background:#0f172a;color:#e2e8f0;padding:18px 22px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;z-index:2}
.modal-head h2{font-size:.95rem;font-weight:700;color:#38bdf8}
.modal-head h2 small{display:block;font-weight:300;font-size:.72rem;color:#94a3b8;margin-top:3px}
.modal-close{background:transparent;border:1.5px solid #475569;color:#94a3b8;font-size:1rem;width:28px;height:28px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .1s,color .1s}
.modal-close:hover{border-color:#e2e8f0;color:#fff}
.modal-body{padding:20px 22px}
.cfr-entry{margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #f1f5f9}
.cfr-entry:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
.cfr-lbl{font-size:.7rem;letter-spacing:1.5px;text-transform:uppercase;color:#3b82f6;margin-bottom:4px;font-weight:700}
.cfr-title{font-size:.88rem;font-weight:700;color:#0f172a;margin-bottom:8px}
.cfr-quote{background:#f8fafc;border-left:3px solid #3b82f6;padding:12px 16px;font-size:.8rem;line-height:1.65;color:#334155;border-radius:0 6px 6px 0}`;

  const ganttCss = `.mermaid{display:block;justify-content:initial;overflow-x:auto;padding:0}
.diagram-wrap{overflow-x:auto}
.task0{fill:#c9dcf4!important;stroke:#2563eb!important;stroke-width:1!important}
.task1{fill:#bde4d4!important;stroke:#047857!important;stroke-width:1!important}
.task2{fill:#f0dfbc!important;stroke:#b45309!important;stroke-width:1!important}
.task3{fill:#dcd2f0!important;stroke:#7c3aed!important;stroke-width:1!important}
.task4{fill:#bee2ea!important;stroke:#0e7490!important;stroke-width:1!important}
.task5{fill:#ead0bd!important;stroke:#9a3412!important;stroke-width:1!important}
.task6{fill:#cccdea!important;stroke:#4338ca!important;stroke-width:1!important}
.task7{fill:#eacdd8!important;stroke:#9d174d!important;stroke-width:1!important}
.crit0,.crit1,.crit2,.crit3,.crit4,.crit5,.crit6,.crit7{fill:#dc2626!important;stroke:#b91c1c!important}
.crit .taskText,.taskText.crit0,.taskText.crit1,.taskText.crit2,.taskText.crit3,.taskText.crit4,.taskText.crit5,.taskText.crit6,.taskText.crit7{fill:#fff!important}
.sectionTitle0{fill:#3b82f6!important;font-weight:700}
.sectionTitle1{fill:#059669!important;font-weight:700}
.sectionTitle2{fill:#d97706!important;font-weight:700}
.sectionTitle3{fill:#8b5cf6!important;font-weight:700}
.sectionTitle4{fill:#0891b2!important;font-weight:700}
.sectionTitle5{fill:#c2410c!important;font-weight:700}
.sectionTitle6{fill:#4f46e5!important;font-weight:700}
.sectionTitle7{fill:#be185d!important;font-weight:700}
.taskText0,.taskText1,.taskText2,.taskText3,.taskText4,.taskText5,.taskText6,.taskText7{fill:#1e293b!important}
.section0,.section1,.section2,.section3,.section4,.section5,.section6,.section7{fill:transparent!important}
.grid .tick line{stroke-width:0.5;stroke:#cbd5e1}`;

  // ── Shared JS helpers (tooltip) ───────────────────────────────────────────
  const tooltipJs = `var tip=document.getElementById('tt'),th=tip.querySelector('.th'),tb=tip.querySelector('.tb');
var activeItem=null;
function show(id,ev){
  var r,h='';
  if(Array.isArray(id)){r=id;}else{r=[];}
  r.forEach(function(k){var d=defined[k];if(d)h+='<div class="ts"><div class="tr">\\u00a7 '+k+' \\u2014 '+d[0]+'</div><div class="tx">'+d[1]+'</div></div>';});
  if(!h)return;
  th.innerHTML='<span>47 CFR References</span><button class="close-btn" onclick="hide()" title="Close">\\u2715</button>';
  tb.innerHTML=h;tip.style.display='block';activeItem=JSON.stringify(id);pos(ev);
}
function pos(ev){
  var p=16,w=tip.offsetWidth,h=tip.offsetHeight,x=ev.clientX+p,y=ev.clientY+p;
  if(x+w>window.innerWidth-p)x=ev.clientX-w-p;
  if(y+h>window.innerHeight-p)y=ev.clientY-h-p;
  if(x<p)x=p;if(y<p)y=p;
  tip.style.left=x+'px';tip.style.top=y+'px';
}
function hide(){tip.style.display='none';activeItem=null;}`;

  // ── Modal JS helpers ──────────────────────────────────────────────────────
  const modalJs = `var overlay=document.getElementById('modalOverlay');
var modalTitle=document.getElementById('modalTitle');
var modalBody=document.getElementById('modalBody');
var modalClose=document.getElementById('modalClose');
function openModal(phase){
  var sub=document.querySelector('.subtitle');
  modalTitle.innerHTML='Phase '+phase.num+' \\u2014 '+phase.name+'<small>'+(sub?sub.textContent:'')+'</small>';
  var html='';
  phase.refs.forEach(function(k){
    var d=defined[k];if(!d)return;
    html+='<div class="cfr-entry"><div class="cfr-lbl">\\u00a7 '+k+'</div><div class="cfr-title">'+d[0]+'</div><div class="cfr-quote">'+d[1]+'</div></div>';
  });
  modalBody.innerHTML=html;
  overlay.classList.add('active');
  document.body.style.overflow='hidden';
}
function openRefs(refs,label){
  modalTitle.innerHTML=label+'<small>47 CFR Part 54</small>';
  var html='';
  refs.forEach(function(k){
    var d=defined[k];if(!d)return;
    html+='<div class="cfr-entry"><div class="cfr-lbl">\\u00a7 '+k+'</div><div class="cfr-title">'+d[0]+'</div><div class="cfr-quote">'+d[1]+'</div></div>';
  });
  if(!html)return;
  modalBody.innerHTML=html;
  overlay.classList.add('active');
  document.body.style.overflow='hidden';
}
function closeModal(){overlay.classList.remove('active');document.body.style.overflow='';}
modalClose.addEventListener('click',closeModal);
overlay.addEventListener('click',function(e){if(e.target===overlay)closeModal();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});`;

  // ── Phase card renderer ───────────────────────────────────────────────────
  function phaseCardsHtml(title2, sub) {
    return `<div class="phase-panel">
<div class="phase-panel-title">${esc(title2)}</div>
<div class="phase-panel-sub">${esc(sub)}</div>
<div class="phase-grid" id="phaseGrid"></div>
</div>
<div class="modal-overlay" id="modalOverlay">
<div class="modal">
<div class="modal-head">
<h2 id="modalTitle">Section</h2>
<button class="modal-close" id="modalClose" aria-label="Close">&#215;</button>
</div>
<div class="modal-body" id="modalBody"></div>
</div>
</div>`;
  }

  const phaseCardsJs = `var phases=${buildPhases(config.phases || [])};
var grid=document.getElementById('phaseGrid');
phases.forEach(function(p){
  var refsLabel=p.refs.map(function(k){return '\\u00a7 '+k;}).join(' \\u00b7 ');
  var card=document.createElement('div');
  card.className='phase-card';
  card.innerHTML='<div class="pc-head"><span class="pc-num">'+p.num+'</span><span class="pc-name">'+p.name+'</span></div><div class="pc-body"><div class="pc-desc">'+p.desc+'<span class="pc-arrow">\\u25B6</span></div><div class="pc-refs">'+refsLabel+'</div></div>';
  card.addEventListener('click',function(){openModal(p);});
  grid.appendChild(card);
});`;

  // ── Instruction text ──────────────────────────────────────────────────────
  const instrText = linkCfrInHtml(layout === "flowchart"
    ? "&#128161; Click any box to see the relevant regulatory text from Title 47 CFR &mdash; text is selectable for copying"
    : layout === "state"
    ? "&#128161; Click any state to see its regulatory text, or scroll down to browse by group"
    : layout === "gantt"
    ? "&#128161; Click any task bar to see the relevant regulatory text, or scroll down to browse by section"
    : "&#128161; Scroll down and click any phase card to see the relevant regulatory text from Title 47 CFR");

  const headerHtml = `<h1>${transformHeader(title, esc, effectiveAcronyms)}</h1>
${subtitle ? `<p class="subtitle">${transformHeader(subtitle, esc, effectiveAcronyms)}</p>` : ""}
<div class="instr-wrap"><div class="instr">${instrText}</div></div>`;

  // ── Mermaid CDN script tag ────────────────────────────────────────────────
  const mermaidScript = `<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.6.1/mermaid.min.js"><\/script>`;

  // ── Per-mode body + script ────────────────────────────────────────────────
  let css, bodyHtml, scriptContent;

  // ── FLOWCHART ─────────────────────────────────────────────────────────────
  if (layout === "flowchart") {
    css = sharedCss + "\n" + legendCss + "\n" + ttCss;

    bodyHtml = `<div class="legend">
<strong>Legend:</strong>
<div class="li"><div class="ls" style="background:#1e40af"></div> Start / Registration</div>
<div class="li"><div class="ls" style="background:#fbbf24"></div> Waiting Period</div>
<div class="li"><div class="ls" style="background:#f97316"></div> Decision Point</div>
<div class="li"><div class="ls" style="background:#16a34a"></div> Approval / Funding</div>
<div class="li"><div class="ls" style="background:#dc2626"></div> Denial / Non-Compliance</div>
</div>
<div id="tt"><div class="th"></div><div class="tb"></div></div>
<div class="diagram-wrap" style="border-left-color:${esc(borderColor)}">
<div class="mermaid">
${mmd}
</div></div>`;

    scriptContent = `var defined=${buildDefined(config.defined)};
var nodeMap=${buildNodeMap(config.nodeMap)};
${tooltipJs}
var activeNode=null;
function showNode(id,ev){
  var r=nodeMap[id];if(!r||!r.length)return;
  show(r,ev);activeItem=id;
}
${acroMermaidSetupJs()}
mermaid.initialize({startOnLoad:true,theme:'base',themeVariables:{fontSize:'12px'},flowchart:{curve:'basis',padding:12}});
window.addEventListener('load',function(){
  setTimeout(function(){
    document.querySelectorAll('.node').forEach(function(n){
      var elId=n.getAttribute('id')||'';
      var m=elId.match(/flowchart-(\\w+)-\\d+/);
      var nid=m?m[1]:n.getAttribute('data-id');
      if(nid&&nodeMap[nid]&&nodeMap[nid].length>0){
        n.style.cursor='pointer';
        n.addEventListener('click',function(e){e.stopPropagation();if(activeItem===nid){hide();}else{showNode(nid,e);}});
      }
    });
    document.addEventListener('click',function(e){if(!tip.contains(e.target)){hide();}});
    var svg=document.querySelector('.mermaid svg');
    if(svg){var bb=svg.getBBox();var p=8;svg.setAttribute('viewBox',(bb.x-p)+' '+(bb.y-p)+' '+(bb.width+p*2)+' '+(bb.height+p*2));svg.style.maxWidth='100%';svg.style.height='auto';_markAcros(svg);}
  },1500);
});`;

  // ── SEQUENCE ──────────────────────────────────────────────────────────────
  } else if (layout === "sequence") {
    css = sharedCss + "\n" + phaseCardCss;

    bodyHtml = `<div class="diagram-wrap" style="border-left-color:${esc(borderColor)}">
<div class="mermaid">
${mmd}
</div></div>
${phaseCardsHtml("Regulatory Reference by Phase", "Click any phase to view the cited CFR provisions")}`;

    scriptContent = `var defined=${buildDefined(config.defined)};
${modalJs}
${phaseCardsJs}
${acroMermaidSetupJs()}
mermaid.initialize({
  startOnLoad:true,theme:'base',
  themeVariables:{
    fontSize:'12px',
    noteBkgColor:'#f0f4f8',noteTextColor:'#1e293b',noteBorderColor:'#cbd5e1',
    actorBkg:'#0f172a',actorTextColor:'#e2e8f0',actorBorder:'#334155',actorLineColor:'#94a3b8',
    signalColor:'#334155',signalTextColor:'#1e293b',
    labelBoxBkgColor:'#f0f4f8',labelBoxBorderColor:'#cbd5e1',labelTextColor:'#3b82f6',
    altSectionBkgColor:'#f8fafc'
  },
  sequence:{
    diagramMarginX:8,diagramMarginY:8,actorMargin:50,width:150,height:45,
    boxMargin:6,boxTextMargin:4,noteMargin:8,messageMargin:30,
    mirrorActors:false,showSequenceNumbers:true,useMaxWidth:false
  },
  securityLevel:'loose'
});
(function waitForSvg(){
  var svg=document.querySelector('.mermaid svg');
  if(!svg||!svg.getBBox().width){setTimeout(waitForSvg,200);return;}
  var bbox=svg.getBBox();var pad=8;
  svg.setAttribute('viewBox',(bbox.x-pad)+' '+(bbox.y-pad)+' '+(bbox.width+pad*2)+' '+(bbox.height+pad*2));
  svg.style.maxWidth='100%';svg.style.height='auto';
  /* Make phase note bars and § refs in arrows clickable */
  var secRe=/\\u00a7 ?([0-9]+\\.[0-9]+(?:\\([a-z]\\)(?:\\([0-9]+\\))?)?)/g;
  function findSecRefs(str){
    secRe.lastIndex=0;var refs=[],m;
    while((m=secRe.exec(str))!==null){
      var key=m[1];
      if(defined[key]){refs.push(key);}
      else{var s=key.replace(/\\([0-9]+\\)$/,'');if(s!==key&&defined[s]){refs.push(s);}
      else{var b=key.replace(/\\([^)]*\\)/g,'');if(b!==key&&defined[b])refs.push(b);}}
    }
    var seen={};return refs.filter(function(r){if(seen[r])return false;seen[r]=true;return true;});
  }
  var texts=svg.querySelectorAll('text');
  texts.forEach(function(textEl){
    var raw=textEl.textContent||'';
    var txt=raw.toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/ +/g,' ').trim();
    if(txt.indexOf('PHASE')<0&&txt.indexOf('ONGOING')<0)return;
    var matched=null;
    for(var i=0;i<phases.length;i++){
      var p=phases[i];
      if(p.num.match(/^[0-9]+$/)&&txt.indexOf('PHASE '+p.num)>=0){matched=p;break;}
      var words=p.name.toUpperCase().split(' ');var ok=true;
      for(var w=0;w<words.length;w++){if(txt.indexOf(words[w])<0){ok=false;break;}}
      if(ok){matched=p;break;}
    }
    if(!matched)return;
    var container=textEl.parentElement;
    while(container&&container!==svg){if(container.querySelector('rect'))break;container=container.parentElement;}
    var rect=container?container.querySelector('rect'):null;
    var clickTarget=container||textEl;
    clickTarget.style.cursor='pointer';
    var origFill=rect?rect.getAttribute('fill'):'';var origStroke=rect?rect.getAttribute('stroke'):'';
    clickTarget.addEventListener('mouseenter',function(){if(rect){rect.setAttribute('fill','#dbeafe');rect.setAttribute('stroke','#3b82f6');}});
    clickTarget.addEventListener('mouseleave',function(){if(rect){rect.setAttribute('fill',origFill);rect.setAttribute('stroke',origStroke);}});
    clickTarget.addEventListener('click',function(e){e.stopPropagation();openModal(matched);});
  });
  var walker=document.createTreeWalker(svg,NodeFilter.SHOW_TEXT,null,false);
  var boundSet=new Set();var node;
  while(node=walker.nextNode()){
    var val=node.nodeValue||'';if(val.indexOf('\\u00a7')<0)continue;
    var full=(node.parentElement?node.parentElement.textContent:'').toUpperCase();
    if(full.indexOf('PHASE')>=0||full.indexOf('ONGOING')>=0)continue;
    var refs=findSecRefs(val);if(!refs.length)continue;
    var target=node.parentElement;if(!target||boundSet.has(target))continue;
    boundSet.add(target);
    target.setAttribute('text-decoration','underline');target.setAttribute('fill','#2563eb');target.style.cursor='pointer';
    (function(t,r,label){
      var orig=t.getAttribute('fill');
      t.addEventListener('mouseenter',function(){t.setAttribute('fill','#1d4ed8');});
      t.addEventListener('mouseleave',function(){t.setAttribute('fill',orig);});
      t.addEventListener('click',function(e){e.stopPropagation();openRefs(r,label);});
    })(target,refs,val.trim());
  }
  _markAcros(svg);
})();`;

  // ── STATE ─────────────────────────────────────────────────────────────────
  } else if (layout === "state") {
    const hasPhases = config.phases && config.phases.length;
    const legendItems = (config.legend || []).map(item =>
      `<div class="li"><div class="ls" style="background:${esc(item.color)}"></div> ${esc(item.label)}</div>`
    ).join("\n");
    const legendBlock = legendItems
      ? `<div class="legend">\n<strong>Legend:</strong>\n${legendItems}\n</div>` : "";

    css = sharedCss + "\n" + legendCss + "\n" + ttCss + "\n" + phaseCardCss;

    bodyHtml = `${legendBlock}
<div id="tt"><div class="th"></div><div class="tb"></div></div>
<div class="diagram-wrap" style="border-left-color:${esc(borderColor)}">
<div class="mermaid">
${mmd}
</div></div>
${hasPhases ? phaseCardsHtml("Regulatory Reference by State Group", "Click any card to view the cited CFR provisions") : ""}`;

    scriptContent = `var defined=${buildDefined(config.defined)};
var stateMap=${buildNodeMap(config.stateMap)};
${tooltipJs}
var activeState=null;
function showState(id,ev){
  var r=stateMap[id];if(!r||!r.length)return;
  show(r,ev);activeItem=id;
}
${hasPhases ? modalJs + "\n" + phaseCardsJs : ""}
${acroMermaidSetupJs()}
mermaid.initialize({startOnLoad:true,theme:'base',themeVariables:{fontSize:'12px'},securityLevel:'loose'});
(function waitForSvg(){
  var svg=document.querySelector('.mermaid svg');
  if(!svg||!svg.getBBox().width){setTimeout(waitForSvg,200);return;}
  var bb=svg.getBBox();var pad=8;
  svg.setAttribute('viewBox',(bb.x-pad)+' '+(bb.y-pad)+' '+(bb.width+pad*2)+' '+(bb.height+pad*2));
  svg.style.maxWidth='100%';svg.style.height='auto';
  var allG=svg.querySelectorAll('g[id]');var bound={};
  allG.forEach(function(g){
    var gid=g.getAttribute('id')||'';
    for(var key in stateMap){
      if(!stateMap[key]||!stateMap[key].length)continue;
      var pat=new RegExp('state-'+key+'(-|$)','i');
      if(pat.test(gid)&&!bound[key]){
        bound[key]=true;g.style.cursor='pointer';
        (function(k,el){el.addEventListener('click',function(e){e.stopPropagation();if(activeItem===k){hide();}else{showState(k,e);}});})(key,g);
      }
    }
  });
  var texts=svg.querySelectorAll('text');
  texts.forEach(function(textEl){
    var raw=(textEl.textContent||'').trim();if(!raw)return;
    for(var key in stateMap){
      if(bound[key]||!stateMap[key]||!stateMap[key].length)continue;
      var rawL=raw.toLowerCase(),keyL=key.toLowerCase();
      if(raw===key||rawL===keyL||rawL.indexOf(keyL)===0){
        bound[key]=true;
        var target=textEl.closest('g')||textEl.parentElement;
        target.style.cursor='pointer';
        (function(k,el){el.addEventListener('click',function(e){e.stopPropagation();if(activeItem===k){hide();}else{showState(k,e);}});})(key,target);
      }
    }
  });
  document.addEventListener('click',function(e){if(!tip.contains(e.target)){hide();}});
  _markAcros(svg);
})();`;

  // ── GANTT ─────────────────────────────────────────────────────────────────
  } else {
    const hasPhases = config.phases && config.phases.length;
    css = sharedCss + "\n" + ganttCss + "\n" + ttCss + "\n" + phaseCardCss;

    bodyHtml = `<div id="tt"><div class="th"></div><div class="tb"></div></div>
<div class="diagram-wrap" style="border-left-color:${esc(borderColor)}">
<div class="mermaid">
${mmd}
</div></div>
${hasPhases ? phaseCardsHtml("Regulatory Reference by Section", "Click any card to view the cited CFR provisions") : ""}`;

    const sectionRefs = hasPhases
      ? JSON.stringify(config.phases.reduce((m, p) => { m[p.name] = p.refs || []; return m; }, {}))
      : "{}";

    scriptContent = `var defined=${buildDefined(config.defined)};
var taskMap=${buildNodeMap(config.taskMap)};
var sectionRefs=${sectionRefs};
${tooltipJs}
var activeTask=null;
function showTask(id,ev){
  var r=taskMap[id];if(!r||!r.length)return;
  show(r,ev);activeItem=id;
}
${hasPhases ? modalJs + "\n" + phaseCardsJs : ""}
${acroMermaidSetupJs()}
mermaid.initialize({
  startOnLoad:true,theme:'base',
  themeVariables:{fontSize:'8px'},
  securityLevel:'loose',
  gantt:{fontSize:8,sectionFontSize:9,numberSectionStyles:8,barHeight:14,barGap:2,
    topPadding:40,sidePadding:10,gridLineStartPadding:10,rightPadding:10,
    leftPadding:100,useMaxWidth:false}
});
(function waitForSvg(){
  var svg=document.querySelector('.mermaid svg');
  if(!svg||!svg.getBBox().width){setTimeout(waitForSvg,200);return;}
  var maxTitleW=90,lineH=10,secIdx=0;
  svg.querySelectorAll('text').forEach(function(t){
    var cls=(t.getAttribute('class')||'');
    if(cls.indexOf('sectionTitle')<0)return;
    secIdx++;
    var secName=t.textContent.trim();if(!secName)return;
    var refs=sectionRefs[secName]||[];
    var refStr=refs.length?'\\u00a7 '+refs.join(', \\u00a7 '):'';
    var x=t.getAttribute('x')||'0',y=parseFloat(t.getAttribute('y'))||0;
    t.textContent='';
    function wrapWords(words,fontSize){
      var lines=[],cur='';
      words.forEach(function(w){
        var test=cur?cur+' '+w:w;
        var tmp=document.createElementNS('http://www.w3.org/2000/svg','tspan');
        tmp.textContent=test;if(fontSize)tmp.style.fontSize=fontSize+'px';
        t.appendChild(tmp);var tw=tmp.getComputedTextLength();t.removeChild(tmp);
        if(tw>maxTitleW&&cur){lines.push(cur);cur=w;}else{cur=test;}
      });
      if(cur)lines.push(cur);return lines;
    }
    var nameLines=wrapWords(secName.split(/\\s+/),null);
    var refLines=refStr?wrapWords(refStr.split(/\\s+/),7):[];
    var allLines=nameLines.concat(refLines),nameCount=nameLines.length;
    var yOff=-((allLines.length-1)*lineH)/2;
    allLines.forEach(function(ln,i){
      var ts=document.createElementNS('http://www.w3.org/2000/svg','tspan');
      ts.setAttribute('x',x);ts.setAttribute('dy',i===0?yOff+'px':lineH+'px');
      ts.textContent=ln;
      if(i>=nameCount){ts.style.fontSize='7px';ts.style.opacity='0.7';}
      t.appendChild(ts);
    });
    if(refs.length){
      t.style.cursor='pointer';
      t.addEventListener('click',function(e){
        e.stopPropagation();
        var h='';refs.forEach(function(k){var d=defined[k];if(d)h+='<div class="ts"><div class="tr">\\u00a7 '+k+' \\u2014 '+d[0]+'</div><div class="tx">'+d[1]+'</div></div>';});
        if(!h)return;
        th.innerHTML='<span>'+secName+'</span><button class="close-btn" onclick="hide()" title="Close">\\u2715</button>';
        tb.innerHTML=h;tip.style.display='block';activeItem='__sec_'+secName;pos(e);
      });
    }
  });
  var barH=14,gridG=svg.querySelector('.grid');
  if(gridG){
    var tf=gridG.getAttribute('transform')||'',m=tf.match(/translate\\(([-.\\d]+)[,\\s]+([-.\\d]+)\\)/);
    if(m)gridG.setAttribute('transform','translate('+m[1]+','+(parseFloat(m[2])+barH)+')');
    var qMonths=['Apr','Jul','Oct'];
    gridG.querySelectorAll('.tick').forEach(function(tick){
      var txt=tick.querySelector('text');if(!txt)return;
      if(qMonths.indexOf(txt.textContent.trim())>=0){
        var ln=tick.querySelector('line');if(ln){ln.style.strokeWidth='1px';ln.style.stroke='#94a3b8';}
      }
    });
  }
  var bb=svg.getBBox();var pad=8;
  svg.setAttribute('viewBox',(bb.x-pad)+' '+(bb.y-pad)+' '+(bb.width+pad*2)+' '+(bb.height+pad*2));
  svg.setAttribute('preserveAspectRatio','xMinYMin meet');
  svg.removeAttribute('width');svg.removeAttribute('height');
  svg.style.width='100%';svg.style.height='auto';svg.style.maxWidth='none';
  var boundT={};
  svg.querySelectorAll('text').forEach(function(textEl){
    var raw=(textEl.textContent||'').trim();if(!raw)return;
    for(var key in taskMap){
      if(boundT[key]||!taskMap[key]||!taskMap[key].length)continue;
      if(raw===key){
        boundT[key]=true;textEl.style.cursor='pointer';
        (function(k,el){
          el.addEventListener('mouseenter',function(){el.style.opacity='0.7';});
          el.addEventListener('mouseleave',function(){el.style.opacity='1';});
          el.addEventListener('click',function(e){e.stopPropagation();if(activeItem===k){hide();}else{showTask(k,e);}});
        })(key,textEl);
      }
    }
  });
  document.addEventListener('click',function(e){if(!tip.contains(e.target)){hide();}});
  _markAcros(svg);
})();`;
  }

  // ── Assemble and write HTML ───────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)} - 47 CFR References</title>
${mermaidScript}
<style>
${css}
</style>
</head><body>
${headerHtml}
${bodyHtml}
<script>
${scriptContent}
<\/script>
</body></html>`;

  fs.writeFileSync(outputPath, html, "utf-8");

  const itemCount = layout === "flowchart" ? Object.keys(config.nodeMap).length
    : layout === "state" ? Object.keys(config.stateMap).length
    : layout === "gantt" ? Object.keys(config.taskMap).length
    : (config.phases || []).length;
  const itemLabel = layout === "flowchart" ? "Nodes"
    : layout === "state" ? "States"
    : layout === "gantt" ? "Tasks"
    : "Phases";

  console.log("\u2713 Generated: " + outputPath);
  console.log("  Layout:      " + layout);
  console.log("  Title:       " + title);
  console.log("  " + itemLabel + ":" + " ".repeat(10 - itemLabel.length) + itemCount);
  console.log("  CFR refs:    " + Object.keys(config.defined).length);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

if (layout === "events") {
  buildEvents();
} else if (layout === "timeline") {
  buildTimeline();
} else if (layout === "lifecycle-t") {
  buildLifecycleT();
} else if (layout === "lifecycle") {
  buildLifecycle();
} else {
  buildMermaid();
}
