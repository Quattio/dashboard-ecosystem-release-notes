#!/usr/bin/env node
/**
 * generate-limits.mjs — Product Limits / Thresholds / Targets tab generator.
 *
 * Extracts compile-time limit/threshold/target defaults from quatt_controller
 * (and quatt-heatcharger-firmware) at a given release tag, renders them as a
 * "Limits" tab, and injects that tab into an existing release page HTML.
 * Rows whose value changed vs the previous release's tag are highlighted.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node tools/generate-limits.mjs \
 *     --page releases/2026-06-30.html \
 *     --cic 4.8.1 \
 *     --controller-tag 6.9.2 \
 *     --prev-controller-tag 6.9.0 \
 *     --heatcharger-ref main \
 *     [--prev-heatcharger-ref <ref>] \
 *     [--spec tools/limits-spec.json]
 *
 * Auth / source resolution:
 *   - GITHUB_TOKEN env var is required (repos are fetched via raw.githubusercontent.com).
 *   - Test hook: if QUATT_LIMITS_SRC_DIR is set, files are read from
 *     $QUATT_LIMITS_SRC_DIR/<repo>/<ref>/<path> instead of the network.
 *
 * The injection is idempotent: content between the limits-tab markers is
 * replaced on re-run, so the script can be run again for the same page.
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- CLI args
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const m = argv[i].match(/^--([\w-]+)$/);
    if (!m) fail(`Unexpected argument: ${argv[i]}`);
    args[m[1]] = argv[++i];
  }
  return args;
}
function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const args = parseArgs(process.argv);
for (const req of ['page', 'cic', 'controller-tag']) {
  if (!args[req]) fail(`--${req} is required`);
}
const SPEC_PATH = args.spec ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'limits-spec.json');
const HC_REF = args['heatcharger-ref'] ?? 'main';
const PREV_CONTROLLER_TAG = args['prev-controller-tag'] ?? null;
const PREV_HC_REF = args['prev-heatcharger-ref'] ?? HC_REF;

const SRC_DIR = process.env.QUATT_LIMITS_SRC_DIR ?? null;
const TOKEN = process.env.GITHUB_TOKEN ?? null;
if (!SRC_DIR && !TOKEN) fail('GITHUB_TOKEN is required (or set QUATT_LIMITS_SRC_DIR for local testing)');

const REPOS = {
  controller: 'Quattio/quatt_controller',
  heatcharger: 'Quattio/quatt-heatcharger-firmware',
};

// ---------------------------------------------------------------- fetching
const fileCache = new Map(); // `${repo}@${ref}:${path}` -> string | null
async function getFile(repo, ref, filePath) {
  const key = `${repo}@${ref}:${filePath}`;
  if (fileCache.has(key)) return fileCache.get(key);
  let text = null;
  if (SRC_DIR) {
    const p = path.join(SRC_DIR, repo, ref, filePath);
    if (fs.existsSync(p)) text = fs.readFileSync(p, 'utf8');
  } else {
    const url = `https://raw.githubusercontent.com/${REPOS[repo]}/${ref}/${filePath}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (res.ok) text = await res.text();
    else if (res.status !== 404) fail(`Fetch failed ${res.status} for ${url}`);
  }
  if (text === null) console.warn(`  warn: not found: ${repo}@${ref}:${filePath}`);
  fileCache.set(key, text);
  return text;
}

// ------------------------------------------------------------- extraction
/** Cut the body of `struct Name { ... };` out of a source text (best effort). */
function structBody(text, structName) {
  const re = new RegExp(`struct\\s+${structName}\\b[^{]*\\{`);
  const m = re.exec(text);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  return text.slice(m.index, i);
}

/** Find `symbol = <number>` / `#define SYMBOL <number>` / chrono in a text blob. */
function findSymbol(text, symbol) {
  const patterns = [
    // constexpr double kFoo = 1.5;   double foo = 2;   uint16_t foo = 3;
    new RegExp(`\\b${symbol}\\s*=\\s*(-?[0-9][0-9_.eE+-]*)\\s*[;,]`),
    // std::chrono::seconds foo = std::chrono::seconds(360);
    new RegExp(`\\b${symbol}\\s*=\\s*std::chrono::\\w+\\((-?[0-9]+)\\)`),
    // #define FOO 1.5f
    new RegExp(`#define\\s+${symbol}\\s+\\(?(-?[0-9][0-9_.eE+-]*)f?\\)?`),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[1].replace(/f$/, '');
  }
  return null;
}

/**
 * Resolve a single token like "sym", "symA|symB" (alternatives), optionally
 * scoped to struct(s) via row.scope. Returns string value or null.
 */
async function resolveToken(token, row, section, ref, repo) {
  const alternatives = token.split('|');
  for (const file of row.files ?? section.files ?? []) {
    const text = await getFile(repo, ref, file);
    if (!text) continue;
    const scopes = row.scope ?? [null];
    for (const scope of scopes) {
      const hay = scope ? structBody(text, scope) : text;
      if (!hay) continue;
      for (const sym of alternatives) {
        const v = findSymbol(hay, sym);
        if (v !== null) return v;
      }
    }
  }
  return null;
}

/** Computed extractor: frequency range from an available_frequencies vector. */
async function computeFreqRange(rowArgs, ref) {
  const text = await getFile('controller', ref, rowArgs.file);
  if (!text) return null;
  const start = text.indexOf(rowArgs.vector);
  if (start === -1) return null;
  const end = text.indexOf('};', start);
  const block = text.slice(start, end);
  // Region rows look like: {id, tmin, tmax, wmin, wmax, {f0, f1, ...}, {levels...}}
  const freqs = new Set();
  for (const m of block.matchAll(/\{\s*([0-9][0-9\s,.]*)\}/g)) {
    const nums = m[1].split(',').map((s) => parseFloat(s.trim())).filter((n) => !Number.isNaN(n));
    // Frequency lists contain 0 plus values >= ~20; level lists are 0..20 monotone small ints.
    if (Math.max(...nums) >= 25) nums.forEach((n) => n > 0 && freqs.add(n));
  }
  if (!freqs.size) return null;
  const sorted = [...freqs].sort((a, b) => a - b);
  return `${sorted[0]} – ${sorted[sorted.length - 1]}`;
}

/** Render a row's value template for a given (controller, heatcharger) ref pair. */
async function renderValue(row, section, refs) {
  const repo = section.repo ?? 'controller';
  const ref = repo === 'controller' ? refs.controller : refs.heatcharger;
  if (row.computed === 'freqRange') {
    return await computeFreqRange(row.args, ref);
  }
  let missing = false;
  const out = await replaceAsync(row.value, /\{([^}]+)\}/g, async (_, token) => {
    const v = await resolveToken(token, row, section, ref, repo);
    if (v === null) {
      missing = true;
      return '?';
    }
    return v;
  });
  return missing ? null : out;
}

async function replaceAsync(str, re, fn) {
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(re)) {
    parts.push(str.slice(last, m.index), await fn(...m));
    last = m.index + m[0].length;
  }
  parts.push(str.slice(last));
  return parts.join('');
}

// ---------------------------------------------------------------- rendering
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderPanel(spec, results, meta) {
  const changedCount = results.filter((r) => r.changed).length;
  const missingCount = results.filter((r) => r.missing).length;
  let html = '';
  html += `<style>
  .limits-note { color: var(--text-muted); font-size: 13px; margin: 6px 0 18px; }
  .limits-h { margin: 26px 0 8px; }
  table.tickets td.lim-src { font-size: 12px; color: var(--text-muted); }
  tr.lim-changed td { background: rgba(255, 180, 0, 0.10); }
  tr.lim-changed td:first-child { border-left: 3px solid #e6a700; }
  tr.lim-missing td { opacity: 0.55; }
  .lim-was { font-size: 11px; color: #e6a700; white-space: nowrap; }
  </style>\n`;
  html += `<p class="limits-note">Compile-time defaults extracted from <code>quatt_controller</code> @ <b>${esc(meta.controllerTag)}</b>`;
  if (meta.hcRef) html += ` and <code>quatt-heatcharger-firmware</code> @ <b>${esc(meta.hcRef)}</b>`;
  if (meta.prevControllerTag) html += `, diffed against controller <b>${esc(meta.prevControllerTag)}</b> (changed rows highlighted${changedCount ? `: ${changedCount}` : ': none'})`;
  html += `. Some values are runtime-overridable via cloud parameters.`;
  if (missingCount) html += ` <b>${missingCount} symbol(s) not found</b> at this tag — see greyed rows.`;
  html += `</p>\n`;

  for (const section of spec.sections) {
    const rows = results.filter((r) => r.sectionId === section.id);
    if (!rows.length) continue;
    html += `<h3 class="limits-h">${esc(section.title)}</h3>\n`;
    html += `<table class="tickets"><thead><tr><th>Parameter</th><th>Value</th><th>Unit</th><th>Source</th></tr></thead><tbody>\n`;
    for (const r of rows) {
      const cls = r.missing ? ' class="lim-missing"' : r.changed ? ' class="lim-changed"' : '';
      const was = r.changed ? ` <span class="lim-was">(was: ${esc(r.prevValue)})</span>` : '';
      const src = (r.files ?? section.files ?? []).map((f) => path.basename(f)).join(', ');
      html += `<tr${cls}><td>${esc(r.label)}</td><td>${r.missing ? 'n/a — symbol not found' : esc(r.valueText)}${was}</td><td>${esc(r.unit ?? '—')}</td><td class="lim-src"><code>${esc(src)}</code></td></tr>\n`;
    }
    html += `</tbody></table>\n`;
  }
  html += `<p class="footer-note">Generated by <code>tools/generate-limits.mjs</code> for CiC ${esc(meta.cic)}. Symbol map: <code>tools/limits-spec.json</code>.</p>\n`;
  return html;
}

// ---------------------------------------------------------------- injection
const BTN_START = '<!-- limits-tab:button:start -->';
const BTN_END = '<!-- limits-tab:button:end -->';
const PANEL_START = '<!-- limits-tab:panel:start -->';
const PANEL_END = '<!-- limits-tab:panel:end -->';

function inject(pageHtml, panelHtml) {
  const button = `${BTN_START}<button class="tab" data-panel="limits">Limits</button>${BTN_END}`;
  const panel = `${PANEL_START}\n<section class="tab-panel" id="panel-limits">\n${panelHtml}</section>\n${PANEL_END}`;

  // Replace existing injected content (idempotent re-run)
  const btnRe = new RegExp(`${BTN_START}[\\s\\S]*?${BTN_END}`);
  const panelRe = new RegExp(`${PANEL_START}[\\s\\S]*?${PANEL_END}`);
  let out = pageHtml;
  if (btnRe.test(out)) out = out.replace(btnRe, button);
  else {
    const anchor = /(<button class="tab" data-panel="engineering">[^<]*<\/button>)/;
    if (!anchor.test(out)) fail('Could not find the Engineering tab button to anchor the Limits tab');
    out = out.replace(anchor, `$1\n    ${button}`);
  }
  if (panelRe.test(out)) out = out.replace(panelRe, panel);
  else {
    const anchor = /(<\/main>)/;
    if (!anchor.test(out)) fail('Could not find </main> to anchor the Limits panel');
    out = out.replace(anchor, `${panel}\n\n$1`);
  }
  return out;
}

// ---------------------------------------------------------------- main
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const refs = { controller: args['controller-tag'], heatcharger: HC_REF };
const prevRefs = PREV_CONTROLLER_TAG ? { controller: PREV_CONTROLLER_TAG, heatcharger: PREV_HC_REF } : null;

console.log(`Extracting limits for CiC ${args.cic} (controller ${refs.controller}, heatcharger ${refs.heatcharger})`);
const results = [];
for (const section of spec.sections) {
  for (const row of section.rows) {
    const valueText = await renderValue(row, section, refs);
    const result = {
      sectionId: section.id,
      label: row.label,
      unit: row.unit,
      files: row.files ?? section.files,
      valueText,
      missing: valueText === null,
      changed: false,
      prevValue: null,
    };
    if (prevRefs && valueText !== null) {
      const prev = await renderValue(row, section, prevRefs);
      if (prev !== null && prev !== valueText) {
        result.changed = true;
        result.prevValue = prev;
      }
    }
    results.push(result);
  }
}

const panelHtml = renderPanel(spec, results, {
  cic: args.cic,
  controllerTag: refs.controller,
  hcRef: refs.heatcharger,
  prevControllerTag: PREV_CONTROLLER_TAG,
});

const pagePath = args.page;
const pageHtml = fs.readFileSync(pagePath, 'utf8');
fs.writeFileSync(pagePath, inject(pageHtml, panelHtml));

const changed = results.filter((r) => r.changed).length;
const missing = results.filter((r) => r.missing).length;
console.log(`Done: ${results.length} rows (${changed} changed vs previous, ${missing} missing) → ${pagePath}`);
if (missing) process.exitCode = 0; // missing symbols are warnings, not failures
