// scripts/regen-agents.mjs â€” node scripts/regen-agents.mjs [--write]
import { createJiti } from 'jiti';
import { isScalar, parseDocument } from 'yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const MAX_AGENT_DESCRIPTION_CHARS = 200;

function serializedDescriptionLength(value) {
  return Array.from(value).reduce((length, point) => {
    if (/^["\\\b\f\n\r\t]$/.test(point)) return length + 2;
    return length + (point.codePointAt(0) < 0x20 ? 6 : 1);
  }, 0);
}

/** Normalize and cap a description without splitting code points or words. */
export function truncateAgentDescription(description, fallback = 'Agent') {
  const safeFallback = fallback.replace(/\s+/g, ' ').trim() || 'Agent';
  const normalized = description.replace(/\s+/g, ' ').trim();
  if (!normalized) return safeFallback;

  const points = Array.from(normalized);
  let fit = 0;
  let serializedLength = 0;
  for (const point of points) {
    const width = serializedDescriptionLength(point);
    if (serializedLength + width > MAX_AGENT_DESCRIPTION_CHARS) break;
    serializedLength += width;
    fit += 1;
  }
  if (fit === points.length) return normalized;

  for (let index = fit - 1; index >= 0; index -= 1) {
    if (/[.!?]/.test(points[index] ?? '') && (index + 1 === points.length || /\s/.test(points[index + 1] ?? ''))) {
      return points.slice(0, index + 1).join('').trimEnd() || safeFallback;
    }
  }
  if (points[fit] && /\s/.test(points[fit])) return points.slice(0, fit).join('').trimEnd() || safeFallback;
  for (let index = fit - 1; index >= 0; index -= 1) {
    if (/\s/.test(points[index] ?? '')) return points.slice(0, index).join('').trimEnd() || safeFallback;
  }
  return points.slice(0, fit).join('') || safeFallback;
}

/** Cap only the description inside an initial YAML frontmatter block. */
export function capDescription(content, agentId = 'Agent') {
  const frontmatter = /^(---\r?\n)([\s\S]*?)(\r?\n---(?=\r?\n|$))/.exec(content);
  if (!frontmatter) return content;
  const [, opening, header, closing] = frontmatter;
  const lines = header.split(/\r?\n/);
  const index = lines.findIndex((line) => /^description:[ \t]*/.test(line));
  if (index < 0) return content;
  const document = parseDocument(header, { schema: 'failsafe' });
  if (document.errors.length > 0) throw document.errors[0];
  const node = document.get('description', true);
  const description = isScalar(node) && typeof node.value === 'string' ? node.value : '';
  const capped = truncateAgentDescription(description, `${agentId} agent`);
  // The parser's value range covers continuation lines and block scalars.
  // Leave blank lines and standalone comments following the value in place.
  const valueEnd = node?.range?.[1];
  const lastValueLine = valueEnd === undefined
    ? index + 1
    : header.slice(0, valueEnd).trimEnd().split(/\r?\n/).length;
  lines.splice(index, Math.max(1, lastValueLine - index), `description: ${JSON.stringify(capped)}`);
  const lineEnding = opening.endsWith('\r\n') ? '\r\n' : '\n';
  const replacement = `${opening}${lines.join(lineEnding)}${closing}`;
  return replacement + content.slice(frontmatter[0].length);
}

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
const root = process.cwd();
const jiti = createJiti(import.meta.url);
const T = join(root, 'libs/backend/harness-sync/src/lib/targets/transformers');
const { OpencodeAgentTransformer } = await jiti.import(join(T, 'opencode-agent-transformer.ts'));
const { CodexAgentTransformer } = await jiti.import(join(T, 'codex-agent-transformer.ts'));
const { atomicWriteWithRetry } = await jiti.import(join(root, 'libs/backend/harness-sync/src/lib/fs/atomic-write.ts'));
const write = process.argv.includes('--write');
const changed = [];
const skipped = [];
for (const file of readdirSync(join(root, '.claude/agents')).filter((f) => f.endsWith('.md'))) {
  const agentId = file.replace(/\.md$/, '');
  const content = capDescription(readFileSync(join(root, '.claude/agents', file), 'utf8'), agentId);
  for (const t of [new OpencodeAgentTransformer(), new CodexAgentTransformer()]) {
    const rel = t.relPathFor(agentId);
    const out = t.transform({ agentId, content });
    let cur = null; try { cur = readFileSync(join(root, rel), 'utf8'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (cur !== out) {
      if (cur !== null && !t.isPtahOutput(cur)) {
        skipped.push(rel);
      } else {
        changed.push(rel);
        if (write) atomicWriteWithRetry(join(root, rel), out);
      }
    }
  }
}
console.log((write ? 'WROTE ' : 'WOULD CHANGE ') + changed.length + '\n' + changed.join('\n'));
if (skipped.length) console.log('SKIPPED (not Ptah output) ' + skipped.length + '\n' + skipped.join('\n'));

}
