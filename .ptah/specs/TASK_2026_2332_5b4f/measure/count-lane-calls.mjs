#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('Usage: node count-lane-calls.mjs --agent <ptahAgentId> [--session <cliSessionId>] [--vendor codex|antigravity]');
  process.exit(2);
}
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (!['--agent', '--session', '--vendor'].includes(key) || !process.argv[i + 1]) usage();
  args[key.slice(2)] = process.argv[++i];
}
if (!args.agent || (args.vendor && !['codex', 'antigravity'].includes(args.vendor))) usage();

function findJournal(agent) {
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Ptah', 'state', 'sessions'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'ptah', 'state', 'sessions'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.ptah', 'state', 'sessions'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && entry.name === `agent-output.${agent}.json`) return full;
      }
    }
  }
  return undefined;
}
function parseObject(text) {
  if (text && typeof text === 'object' && !Array.isArray(text)) return text;
  if (typeof text !== 'string') return {};
  try { const value = JSON.parse(text); return value && typeof value === 'object' ? value : {}; }
  catch { return {}; }
}
function shortClass(value) {
  if (!value) return 'Error';
  const m = String(value).match(/(?:^|\b)([A-Za-z_$][\w$]*(?:Error|Exception))(?:\b|$)/);
  return m?.[1] ?? 'Error';
}
function isPtah(name) { return /^mcp__ptah__ptah_/i.test(name) || /(?:^|\s)mcp_ptah_lane_ptah_/i.test(name); }
function toolSearch(name) {
  const identity = name.toLowerCase()
    .replace(/^mcp__ptah__/, '')
    .replace(/^mcp_ptah_lane_/, '')
    .replace(/[^a-z0-9]+/g, '_');
  return new Set(['toolsearch', 'tools_list']).has(identity);
}
function classify(name, input) {
  const parsed = parseObject(input);
  const command = parsed.command ?? parsed.CommandLine ?? parsed.commandLine ?? (isCommandName(name) ? name.replace(/^run\s+/i, '') : '');
  const low = `${name} ${JSON.stringify(parsed)} ${command}`.toLowerCase();
  if (/^file\s/i.test(name) || /^file\b/i.test(name)) return ['file-read', 'ptah_read_symbol'];
  if (isCommandName(name)) {
    if (/\b(rg|grep|select-string|findstr)\b/.test(low)) return ['text-search', 'ptah_grep'];
    if (/\b(cat|type|get-content|readfile|open_file)\b/.test(low)) return ['file-read', 'ptah_read_symbol'];
    if (/\b(ls|dir|get-childitem|glob|tree)\b/.test(low)) return ['path-listing', 'ptah_search_files'];
    if (/\bgit\s+(status|log|show|diff|branch|rev-parse)\b/.test(low)) return ['git-read', null];
  }
  return ['other', null];
}
function isCommandName(name) {
  return /^run\s/i.test(name) || /^(bash|shell|powershell|command)$/i.test(name) || /^(git|rg|grep|select-string|findstr|ls|dir|cat|type|Get-ChildItem|Get-Content)\b/i.test(name);
}
function commandFirst(input) {
  const parsed = parseObject(input);
  const command = parsed.command ?? parsed.CommandLine ?? parsed.commandLine ?? '';
  if (typeof command === 'string' && command.trim()) {
    const token = command.trim().replace(/^['"]/, '').match(/^[\w./:\\-]+/)?.[0] ?? '';
    return token.split(/[\\/]/).at(-1) ?? '';
  }
  return '';
}
const file = findJournal(args.agent);
if (!file) { console.error(`No Ptah saved output found for agent ${args.agent}`); process.exit(1); }
let journal;
try { journal = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch { console.error(`Could not parse Ptah saved output: ${file}`); process.exit(1); }
if (journal.agentId !== args.agent) { console.error(`Saved output agent ID mismatch in ${file}`); process.exit(1); }
const segments = Array.isArray(journal.segments) ? journal.segments : [];
const calls = segments.filter(s => s?.type === 'tool-call');
if (!calls.length) { console.error(`No tool-call data found for agent ${args.agent} in ${file}`); process.exit(1); }
const results = new Map();
for (const s of segments) if (String(s?.type).startsWith('tool-result')) results.set(s.toolCallId, s);
const ptah = calls.filter(c => isPtah(c.toolName));
const native = calls.filter(c => !isPtah(c.toolName));
let firstSuccessIndex = -1;
const ptahErrors = [];
for (let i = 0; i < calls.length; i++) {
  const c = calls[i]; const result = results.get(c.toolCallId);
  const errored = c.type === 'tool-result-error' || result?.type === 'tool-result-error' || result?.isError === true;
  if (isPtah(c.toolName) && !errored && firstSuccessIndex < 0) firstSuccessIndex = i;
  if (isPtah(c.toolName) && errored) ptahErrors.push({ tool: c.toolName, class: shortClass(result?.content ?? c.content) });
}
const byTool = {};
for (const c of calls) byTool[c.toolName] = (byTool[c.toolName] ?? 0) + 1;
const nativeCalls = native.map(c => {
  const input = c.toolInput ?? c.toolArgs ?? '';
  const [callClass, substitute] = classify(c.toolName, input);
  const shellName = isCommandName(c.toolName) ? 'Run' : c.toolName;
  const detail = { tool: shellName, class: callClass, substitute };
  if (shellName === 'Run') {
    detail.command = commandFirst(input) || (isCommandName(c.toolName) ? c.toolName.replace(/^run\s+/i, '').trim().match(/^[\w.-]+/)?.[0] : '') || '';
  }
  return detail;
});
const totalCalls = calls.length;
const ptahCalls = ptah.length;
const safeByTool = {};
for (const c of calls) {
  const input = c.toolInput ?? c.toolArgs ?? '';
  const name = isCommandName(c.toolName) ? `Run ${commandFirst(input) || c.toolName.replace(/^run\s+/i, '').trim().match(/^[\w.-]+/)?.[0] || 'command'}` : c.toolName;
  safeByTool[name] = (safeByTool[name] ?? 0) + 1;
}
console.log(JSON.stringify({
  totalCalls, ptahCalls, nativeCalls: native.length,
  ptahShare: totalCalls ? Number((ptahCalls / totalCalls).toFixed(4)) : 0,
  ptahErrors, discoveryCalls: calls.filter(c => toolSearch(c.toolName)).length,
  callsBeforeFirstPtahSuccess: firstSuccessIndex < 0 ? null : firstSuccessIndex,
  byTool: safeByTool,
  nativeCallDetails: nativeCalls,
  substitutableNative: { count: nativeCalls.filter(c => c.substitute !== null).length, calls: nativeCalls.filter(c => c.substitute !== null) },
  source: file,
}));


