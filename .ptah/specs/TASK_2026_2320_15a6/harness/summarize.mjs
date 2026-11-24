/**
 * Summary of stage2 rows (before and after), same weighting as the round 5/6 report:
 *   claude: weighted = input + 1.25 x cacheWrite + 0.1 x cacheRead + output
 *   codex:  weighted = (input_tokens - cached_input_tokens) + 0.1 x cached + output
 *           (codex input_tokens includes cached input; no cache write)
 * Usage: node summarize.mjs <file.jsonl>[:arm1,arm2] ... [--tasks=id1,id2] [--rows]
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--tasks=')) || '').slice(8).split(',').filter(Boolean);
const showRows = args.includes('--rows');
const files = args.filter((a) => !a.startsWith('--'));

export function norm(u) {
  if (!u) return { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
  if ('input_tokens' in u) {
    const cached = u.cached_input_tokens || 0;
    return { input: u.input_tokens - cached, cacheWrite: 0, cacheRead: cached, output: u.output_tokens || 0 };
  }
  return { input: u.input || 0, cacheWrite: u.cacheWrite || 0, cacheRead: u.cacheRead || 0, output: u.output || 0 };
}
export const weighted = (n) => n.input + 1.25 * n.cacheWrite + 0.1 * n.cacheRead + n.output;

const k = (x) => `${Math.round(x / 1000)}k`;
for (const spec of files) {
  const [file, armList] = spec.split(':');
  const arms = (armList || '').split(',').filter(Boolean);
  const rows = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((r) => (!arms.length || arms.includes(r.arm)) && (!only.length || only.includes(r.task)));
  const byArm = new Map();
  for (const r of rows) byArm.set(r.arm, [...(byArm.get(r.arm) || []), r]);
  for (const [arm, rs] of byArm) {
    const t = { n: rs.length, ok: 0, calls: 0, cls: {}, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, w: 0, ms: 0, chars: 0 };
    for (const r of rs) {
      const n = norm(r.usage);
      t.ok += r.correct ? 1 : 0;
      t.calls += r.calls;
      for (const [c, v] of Object.entries(r.byClass || {})) t.cls[c] = (t.cls[c] || 0) + v;
      t.input += n.input; t.cacheWrite += n.cacheWrite; t.cacheRead += n.cacheRead; t.output += n.output;
      t.w += weighted(n);
      t.ms += r.ms;
      t.chars += r.resultChars || 0;
      if (showRows)
        console.log(`  ${arm} ${r.task} ${r.correct ? 'OK' : 'WRONG ' + JSON.stringify(r.missing)} calls=${r.calls} ${JSON.stringify(r.byClass)} w=${k(weighted(n))} ${Math.round(r.ms / 1000)}s ${r.error || ''}`);
    }
    console.log(
      `${file.split('/').pop()} | ${arm} | ${t.ok}/${t.n} | ${t.calls} | ${JSON.stringify(t.cls)} | in ${k(t.input)} | cw ${k(t.cacheWrite)} | cr ${k(t.cacheRead)} | out ${k(t.output)} | w ${k(t.w)} | ${Math.round(t.ms / 1000)} s | chars ${k(t.chars)}`,
    );
  }
}
