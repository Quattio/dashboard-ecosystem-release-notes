#!/usr/bin/env node
/**
 * test-limits.mjs — offline self-test for generate-limits.mjs.
 *
 * Runs the generator against the fake-value fixtures in tools/test-fixtures
 * (no network, no token) on a copy of a real release page, then asserts:
 *   - the Limits tab button and panel are injected
 *   - scoped extraction ignores decoy symbols in other structs
 *   - struct-name fallbacks (6.8.x vs 6.9.x naming) resolve
 *   - symbol alternatives (percentage vs raw pwm level) resolve
 *   - diff highlighting marks exactly the rows that differ current vs prev
 *   - re-running is idempotent (markers replaced, not duplicated)
 *
 * Usage: node tools/test-limits.mjs   (or: npm run limits:test)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const tools = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.dirname(tools);
const outDir = path.join(tools, 'test-output');
fs.mkdirSync(outDir, { recursive: true });
const page = path.join(outDir, 'limits-test-page.html');
fs.copyFileSync(path.join(repoRoot, 'releases', '2026-06-30.html'), page);

const env = {
  ...process.env,
  QUATT_LIMITS_SRC_DIR: path.join(tools, 'test-fixtures'),
};
delete env.GITHUB_TOKEN;

const run = () =>
  execFileSync(
    process.execPath,
    [
      path.join(tools, 'generate-limits.mjs'),
      '--page', page,
      '--cic', 'TEST',
      '--controller-tag', 'current',
      '--prev-controller-tag', 'prev',
      '--heatcharger-ref', 'hc-test',
    ],
    { env, encoding: 'utf8' },
  );

console.log(run());
const html1 = fs.readFileSync(page, 'utf8');
console.log(run()); // idempotency: run twice
const html2 = fs.readFileSync(page, 'utf8');

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

check('tab button injected once', (html2.match(/data-panel="limits"/g) || []).length === 1);
check('panel injected once', (html2.match(/id="panel-limits"/g) || []).length === 1);
check('idempotent re-run', html1 === html2);
check('scoped extraction (decoy 999 not used)', !html2.includes('999'));
check('watchdog value extracted', html2.includes('58.0 (hyst. 51.0)'));
check('chrono seconds extracted', html2.includes('361 / 362'));
check('freq range computed', html2.includes('31 – 91'));
check('define with f-suffix extracted', html2.includes('115.5'));
check('symbol alternative (percentage) used for current', html2.includes('7.5'));
check('diff: cooling start highlighted (27.5, was 25.5)', html2.includes('27.5') && html2.includes('was: 25.5'));
check('diff: test frequency highlighted (35, was 49)', html2.includes('was: 49'));
check('diff: unchanged row not highlighted (heating start/stop)', !html2.includes('was: 20.1 / 30.1'));
check('mixed-mode struct fallback diff (was: 18.3 / 28.3)', html2.includes('was: 18.3 / 28.3'));
check('charging struct missing at prev → no diff, still rendered', html2.includes('20.2 / 26.2 / 23.2'));
const thermoRow = (html2.match(/<tr[^>]*><td>Heating setpoint \(thermostat active\)[\s\S]*?<\/tr>/) || [''])[0];
check('estimator file fallback across paths (no diff)', thermoRow.includes('25.5') && !thermoRow.includes('lim-was') && !thermoRow.includes('lim-changed'));

if (failures) {
  console.error(`\n${failures} check(s) failed. Output page: ${page}`);
  process.exit(1);
}
console.log(`\nAll checks passed. Inspect visually: open ${path.relative(repoRoot, page)}`);
