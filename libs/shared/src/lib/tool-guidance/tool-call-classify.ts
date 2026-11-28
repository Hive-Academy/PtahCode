export type CallServer = 'ptah' | `mcp:${string}` | 'native';
export type OperationClass = 'ptah' | 'discovery' | 'native-substitutable' | 'native-other';
export type NativeClass = 'text-search' | 'file-read' | 'path-listing' | 'git-read';

export interface ToolCallInput {
  readonly name: string;
  readonly input?: unknown;
  readonly server?: string;
  readonly error?: boolean;
}

export interface ToolCallClassification {
  readonly server: CallServer;
  readonly operation: OperationClass;
  readonly nativeClass: NativeClass | null;
}

const extras: Readonly<Record<NativeClass, readonly string[]>> = {
  'text-search': ['Select-String', 'findstr', 'git grep', 'grep', 'rg'],
  'file-read': ['Get-Content', 'type', 'sed', 'cat', 'head', 'tail'],
  'path-listing': ['Get-ChildItem', 'find', 'ls', 'dir', 'git ls-files'],
  'git-read': ['git status', 'git diff', 'git log', 'git show', 'git branch'],
};

const MUTATING_PIPELINE_COMMANDS = new Set([
  'tee',
  'out-file',
  'set-content',
  'add-content',
]);

const MUTATING_FIND_ARGS = new Set([
  '-delete',
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
  '-fprint',
  '-fprint0',
  '-fprintf',
  '-fls',
]);

const MUTATING_GIT_BRANCH_LONG_FLAGS = new Set([
  '--delete',
  '--move',
  '--copy',
  '--force',
  '--set-upstream-to',
  '--unset-upstream',
  '--edit-description',
  '--track',
  '--no-track',
]);

const GIT_BRANCH_VALUE_FLAGS = new Set([
  '--contains',
  '--no-contains',
  '--merged',
  '--no-merged',
  '--points-at',
  '--sort',
  '--format',
  '--abbrev',
  '--color',
  '--column',
]);

function shellCommand(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (input === null || typeof input !== 'object') return '';
  const object = input as Record<string, unknown>;
  for (const key of ['command', 'cmd', 'script', 'command_line']) {
    const value = object[key];
    if (typeof value === 'string') return value.trim();
  }
  return '';
}

function stripQuotedStrings(command: string): string {
  return command
    .replace(/'[^']*'/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ');
}

function tokenizeArgs(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? '';
    if (quote !== null) {
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        current += command[i + 1] ?? '';
        i++;
      } else if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/[\s;&|]/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function hasOutputRedirection(unquotedCommand: string): boolean {
  if (/(?:^|[^<])>{1,2}(?!&\d)/.test(unquotedCommand)) return true;
  const stages = unquotedCommand.split(/(?:\|\||&&|[|;&])+/);
  for (const stage of stages) {
    const tokens = stage.trim().split(/\s+/).filter(Boolean);
    let idx = 0;
    while (idx < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tokens[idx] ?? '')) idx++;
    const cmd = (tokens[idx] ?? '').split(/[\\/]/).pop()?.toLowerCase() ?? '';
    if (MUTATING_PIPELINE_COMMANDS.has(cmd)) return true;
  }
  return false;
}

function isMutatingSed(args: readonly string[]): boolean {
  for (const arg of args) {
    if (arg === '--') break;
    if (arg === '--in-place' || arg.startsWith('--in-place=')) return true;
    if (/^-[a-zA-Z]*i/.test(arg)) return true;
  }
  return false;
}

function isMutatingFind(args: readonly string[]): boolean {
  return args.some((arg) => MUTATING_FIND_ARGS.has(arg.toLowerCase()));
}

function isMutatingGitBranch(args: readonly string[]): boolean {
  let listMode = false;
  let expectingValue = false;
  for (const arg of args) {
    if (expectingValue) {
      expectingValue = false;
      continue;
    }
    if (arg === '--') break;
    if (arg === '-l' || arg === '--list') {
      listMode = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const [flag] = arg.split('=');
      const lower = (flag ?? arg).toLowerCase();
      if (MUTATING_GIT_BRANCH_LONG_FLAGS.has(lower)) return true;
      if (!arg.includes('=') && GIT_BRANCH_VALUE_FLAGS.has(lower)) {
        expectingValue = true;
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      if (/^-[^-]*[dDmMcCf]/.test(arg)) return true;
      continue;
    }
    if (!listMode) return true;
  }
  return false;
}

function parseMcpServer(name: string): string | undefined {
  if (/^mcp__/i.test(name)) {
    const rest = name.slice('mcp__'.length);
    const sep = rest.indexOf('__');
    const server = sep >= 0 ? rest.slice(0, sep) : rest;
    return server.length > 0 ? server : undefined;
  }
  return name.match(/^MCP\(([^_)]+)/i)?.[1];
}

const SAFE_PIPE_FILTER_COMMANDS = new Set([
  'wc',
  'uniq',
  'nl',
  'tr',
  'cut',
  'column',
]);

interface CommandStage {
  readonly command: string;
  readonly separator: '|' | 'chain' | null;
}

function splitCommandStages(command: string): CommandStage[] | null {
  const stages: CommandStage[] = [];
  let start = 0;
  let quote: '"' | "'" | null = null;
  let separator: '|' | 'chain' | null = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? '';
    if (quote !== null) {
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '\n' || ch === '\r' || ch === '`') return null;
    if ((ch === '$' || ch === '<' || ch === '>') && command[i + 1] === '(') {
      return null;
    }
    if (ch === ';' || ch === '|' || ch === '&') {
      if (ch === '&') {
        const before = command.slice(start, i);
        if (/(?:^|\s)\d*[<>]$/.test(before)) continue;
      }
      const next = command[i + 1];
      const tokenLen =
        (ch === '|' && next === '|') || (ch === '&' && next === '&') ? 2 : 1;
      const stageSep: '|' | 'chain' =
        ch === '|' && tokenLen === 1 ? '|' : 'chain';
      stages.push({ command: command.slice(start, i), separator });
      separator = stageSep;
      i += tokenLen - 1;
      start = i + 1;
    }
  }
  stages.push({ command: command.slice(start), separator });
  return stages;
}

function isMutatingSort(args: readonly string[]): boolean {
  for (const arg of args) {
    if (arg === '--') break;
    if (arg === '-o' || arg.startsWith('-o') || arg === '--output' || arg.startsWith('--output=')) {
      return true;
    }
  }
  return false;
}

function classifySingleStage(stage: string): {
  readonly category: NativeClass | null;
  readonly isSafePipeFilter: boolean;
} {
  const words = tokenizeArgs(stage);
  let offset = 0;
  while (
    offset < words.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(words[offset] ?? '') ||
      words[offset] === '&')
  ) {
    offset++;
  }
  const first = (words[offset] ?? '').split(/[\\/]/).pop()?.toLowerCase() ?? '';
  if (!first) return { category: null, isSafePipeFilter: false };
  const second = first === 'git' ? (words[offset + 1] ?? '').toLowerCase() : '';
  const normalized = first === 'git' ? `git ${second}` : first;
  const args =
    first === 'git' ? words.slice(offset + 2) : words.slice(offset + 1);
  if (first === 'sed' && isMutatingSed(args)) {
    return { category: null, isSafePipeFilter: false };
  }
  if (first === 'find' && isMutatingFind(args)) {
    return { category: null, isSafePipeFilter: false };
  }
  if (normalized === 'git branch' && isMutatingGitBranch(args)) {
    return { category: null, isSafePipeFilter: false };
  }
  for (const [category, commands] of Object.entries(extras) as [
    NativeClass,
    readonly string[],
  ][]) {
    if (
      commands.some(
        (word) => word.toLowerCase() === normalized || word.toLowerCase() === first,
      )
    ) {
      return { category, isSafePipeFilter: true };
    }
  }
  const isSafeFilter =
    SAFE_PIPE_FILTER_COMMANDS.has(first) ||
    (first === 'sort' && !isMutatingSort(args));
  return { category: null, isSafePipeFilter: isSafeFilter };
}

function nativeClass(call: ToolCallInput): NativeClass | null {
  const name = call.name.toLowerCase().replace(/_/g, '-');
  if (/^(grep|rg|search|select-string|findstr)\b/.test(name)) return 'text-search';
  if (/^(read|view|view-file|cat|file-read|get-content)\b/.test(name)) return 'file-read';
  if (/^(glob|ls|dir|list|get-childitem)\b/.test(name)) return 'path-listing';
  if (/^git\s+(status|diff|log|show|branch)\b/.test(name)) return 'git-read';
  if (!/^(shell|bash|powershell|terminal|exec-command|shell-command)$/.test(name)) return null;
  const command = shellCommand(call.input)
    .replace(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*cd\s+[^;&|]+&&\s*/i, '')
    .replace(/^\s*(?:["'])(.*?)(?:["'])/, '$1');
  if (hasOutputRedirection(stripQuotedStrings(command))) return null;
  const stages = splitCommandStages(command);
  if (!stages || stages.length === 0) return null;
  const primary = classifySingleStage(stages[0]?.command ?? '');
  if (primary.category === null) return null;
  for (let i = 1; i < stages.length; i++) {
    const stage = stages[i];
    if (!stage || stage.separator !== '|') return null;
    if (!classifySingleStage(stage.command).isSafePipeFilter) return null;
  }
  return primary.category;
}

/**
 * Classify a tool call into its server (`ptah`, `mcp:<server>`, `native`),
 * operation class, and substitutable native category without retaining any
 * arguments, paths, or command text.
 */
export function classifyToolCall(call: ToolCallInput): ToolCallClassification {
  let name = call.name;
  let serverInput = call.server;
  let input = call.input;
  if (/^(use_tool|tool_call)$/i.test(name) && input !== null && typeof input === 'object') {
    const envelope = input as Record<string, unknown>;
    name = typeof envelope['toolName'] === 'string' ? envelope['toolName'] : typeof envelope['name'] === 'string' ? envelope['name'] : typeof envelope['tool'] === 'string' ? envelope['tool'] : name;
    serverInput = typeof envelope['server'] === 'string' ? envelope['server'] : typeof envelope['serverName'] === 'string' ? envelope['serverName'] : serverInput;
    input = envelope['arguments'] ?? envelope['input'] ?? input;
  }
  if (/^file\s+/i.test(name)) return { server: 'native', operation: 'native-substitutable', nativeClass: 'file-read' };
  if (/^run\s+/i.test(name)) name = name.replace(/^run\s+/i, '');
  const lowerName = name.toLowerCase();
  const normalizedServer = serverInput?.toLowerCase();
  const explicitPtah = lowerName.startsWith('ptah_') || lowerName.startsWith('mcp__ptah__') || lowerName.startsWith('ptah__') || lowerName.startsWith('mcp_ptah_lane_ptah_') || normalizedServer === 'ptah';
  const mcp = parseMcpServer(name) ?? normalizedServer;
  const server: CallServer = explicitPtah ? 'ptah' : mcp ? `mcp:${mcp}` : 'native';
  if (server === 'ptah') return { server, operation: 'ptah', nativeClass: null };
  if (/tool.?search|search_tool|toolsearch|list_tools|tool.?discovery/i.test(name)) {
    return { server, operation: 'discovery', nativeClass: null };
  }
  if (server !== 'native') return { server, operation: 'native-other', nativeClass: null };
  const category = nativeClass({ name, input, server: serverInput });
  return { server, operation: category ? 'native-substitutable' : 'native-other', nativeClass: category };
}
