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
  'file-read': ['Get-Content', 'type', 'sed', 'sed -n', 'cat', 'head', 'tail'],
  'path-listing': ['Get-ChildItem', 'find', 'git ls-files'],
  'git-read': ['git status', 'git diff', 'git log', 'git show', 'git branch'],
};

function shellCommand(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (input === null || typeof input !== 'object') return '';
  const object = input as Record<string, unknown>;
  for (const key of ['command', 'cmd', 'script', 'command_line']) {
    if (typeof object[key] === 'string') return (object[key] as string).trim();
  }
  return '';
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
  const words = command.split(/[\s;&|]+/).filter(Boolean);
  let offset = 0;
  while (offset < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(words[offset] ?? '') || words[offset] === '&')) offset++;
  const first = (words[offset] ?? '').split(/[\\/]/).pop()?.toLowerCase() ?? '';
  const second = first === 'git' ? (words[offset + 1] ?? '').toLowerCase() : '';
  const normalized = first === 'git' ? `git ${second}` : first;
  for (const [category, commands] of Object.entries(extras) as [NativeClass, readonly string[]][]) {
    if (commands.some((word) => word.toLowerCase() === normalized || word.toLowerCase() === first)) return category;
  }
  if (['grep', 'rg'].includes(first)) return 'text-search';
  if (['cat', 'sed', 'head', 'tail'].includes(first)) return 'file-read';
  if (['ls', 'dir', 'find'].includes(first)) return 'path-listing';
  if (first === 'git' && ['status', 'diff', 'log', 'show', 'branch'].includes(second)) return 'git-read';
  return null;
}

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
  const mcp = name.match(/^(?:mcp__|MCP\()([^_)]+)/i)?.[1] ?? normalizedServer;
  const server: CallServer = explicitPtah ? 'ptah' : mcp ? `mcp:${mcp}` : 'native';
  if (server === 'ptah') return { server, operation: 'ptah', nativeClass: null };
  if (/tool.?search|search_tool|toolsearch|list_tools|tool.?discovery/i.test(name)) {
    return { server, operation: 'discovery', nativeClass: null };
  }
  if (server !== 'native') return { server, operation: 'native-other', nativeClass: null };
  const category = nativeClass({ name, input, server: serverInput });
  return { server, operation: category ? 'native-substitutable' : 'native-other', nativeClass: category };
}
