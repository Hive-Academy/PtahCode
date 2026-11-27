import { classifyToolCall } from './tool-call-classify';

describe('classifyToolCall', () => {
  it.each([
    ['ptah_grep', undefined, 'ptah'],
    ['mcp__ptah__ptah_grep', undefined, 'ptah'],
    ['ptah__ptah_grep', undefined, 'ptah'],
    ['mcp_ptah_lane_ptah_grep', undefined, 'ptah'],
    ['Run mcp_ptah_lane_ptah_grep', undefined, 'ptah'],
    ['read_file', 'ptah', 'ptah'],
    ['use_tool', undefined, 'ptah'],
  ] as const)('recognizes Ptah call form %s', (name, server, expected) => {
    const input = name === 'use_tool' ? { server: 'ptah', toolName: 'grep' } : undefined;
    expect(classifyToolCall({ name, ...(server ? { server } : {}), input }).server).toBe(expected);
  });

  it('classifies other MCP servers and discovery calls', () => {
    expect(classifyToolCall({ name: 'mcp__github__search' }).server).toBe('mcp:github');
    expect(classifyToolCall({ name: 'ToolSearch' }).operation).toBe('discovery');
    expect(classifyToolCall({ name: 'search_tool' }).operation).toBe('discovery');
    expect(classifyToolCall({ name: 'list_tools' }).operation).toBe('discovery');
  });

  it.each([
    ['Grep', 'text-search'], ['rg', 'text-search'], ['Get-Content', 'file-read'],
    ['Read', 'file-read'], ['Glob', 'path-listing'], ['Get-ChildItem', 'path-listing'],
    ['git status', 'git-read'],
  ] as const)('classifies %s as substitutable %s', (name, nativeClass) => {
    const toolName = name.startsWith('git ') ? 'exec_command' : name;
    const input = name.startsWith('git ') ? { cmd: name } : undefined;
    expect(classifyToolCall({ name: toolName, input }).nativeClass).toBe(nativeClass);
    expect(classifyToolCall({ name: toolName, input }).operation).toBe('native-substitutable');
  });

  it.each([
    'rg needle file', 'grep needle file | head', 'cd x && rg needle',
    'FLAG=1 rg needle file', 'cd x && rg needle file', 'Select-String needle file', 'findstr needle file',
    'Get-Content file', 'sed -n 1,3p file', 'head file', 'tail file',
    'Get-ChildItem src', 'git ls-files', 'git diff --stat',
  ])('reads shell command class from first command: %s', (cmd) => {
    const classification = classifyToolCall({ name: 'exec_command', input: { cmd } });
    expect(classification.operation).toBe('native-substitutable');
  });

  it.each([
    ['bash', 'grep needle file', 'text-search'],
    ['powershell', 'Get-Content file', 'file-read'],
    ['terminal', 'git status --short', 'git-read'],
  ] as const)('classifies shell form %s', (name, cmd, nativeClass) => {
    expect(classifyToolCall({ name, input: { command: cmd } }).nativeClass).toBe(nativeClass);
  });

  it('leaves writes and unclassified commands as native-other', () => {
    expect(classifyToolCall({ name: 'exec_command', input: { cmd: 'npm test' } }).operation).toBe('native-other');
    expect(classifyToolCall({ name: 'mcp__github__search' }).operation).toBe('native-other');
  });
});
