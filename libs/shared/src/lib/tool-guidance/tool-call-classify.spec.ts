import { classifyToolCall } from './tool-call-classify';

describe('classifyToolCall', () => {
  it.each([
    ['ptah_grep', undefined, 'ptah'],
    ['mcp__ptah__ptah_grep', undefined, 'ptah'],
    ['ptah__ptah_grep', undefined, 'ptah'],
    ['ptah__x', undefined, 'ptah'],
    ['ptah_x', undefined, 'ptah'],
    ['mcp_ptah_lane_ptah_grep', undefined, 'ptah'],
    ['Run mcp_ptah_lane_ptah_grep', undefined, 'ptah'],
    ['read_file', 'ptah', 'ptah'],
    ['use_tool', undefined, 'ptah'],
  ] as const)('recognizes Ptah call form %s', (name, server, expected) => {
    const input = name === 'use_tool' ? { server: 'ptah', toolName: 'grep' } : undefined;
    expect(classifyToolCall({ name, ...(server ? { server } : {}), input }).server).toBe(expected);
  });

  it.each([
    ['mcp__github__search', 'mcp:github'],
    ['mcp__my_server__do_thing', 'mcp:my_server'],
    ['mcp__team_one__read', 'mcp:team_one'],
    ['MCP(github/secret) query', 'mcp:github/secret'],
  ] as const)('preserves MCP server name for %s as %s', (name, expectedServer) => {
    expect(classifyToolCall({ name }).server).toBe(expectedServer);
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
    ['rg needle file', 'text-search'],
    ['grep needle file | head', 'text-search'],
    ['rg "a > b" file', 'text-search'],
    ['rg needle file 2>&1', 'text-search'],
    ['cd x && rg needle', 'text-search'],
    ['FLAG=1 rg needle file', 'text-search'],
    ['Select-String needle file', 'text-search'],
    ['findstr needle file', 'text-search'],
    ['Get-Content file', 'file-read'],
    ['sed -n 1,3p file', 'file-read'],
    ['head file', 'file-read'],
    ['tail file', 'file-read'],
    ['Get-ChildItem src', 'path-listing'],
    ['find src -name "*.ts"', 'path-listing'],
    ['git ls-files', 'path-listing'],
    ['git diff --stat', 'git-read'],
    ['git show HEAD', 'git-read'],
    ['git branch', 'git-read'],
    ['git branch --list', 'git-read'],
    ['git branch --list "feat/*"', 'git-read'],
    ['git branch -a', 'git-read'],
    ['git branch -vv', 'git-read'],
    ['git branch --show-current', 'git-read'],
    ['git branch --merged main', 'git-read'],
  ] as const)('reads shell command class from read-only command: %s', (cmd, nativeClass) => {
    const classification = classifyToolCall({ name: 'exec_command', input: { cmd } });
    expect(classification.operation).toBe('native-substitutable');
    expect(classification.nativeClass).toBe(nativeClass);
  });

  it.each([
    "sed -i 's/a/b/' config.txt",
    "sed -i.bak 's/a/b/' config.txt",
    "sed --in-place 's/a/b/' config.txt",
    "sed -ni 's/a/b/p' config.txt",
    'find . -name "*.tmp" -delete',
    'find src -type f -exec rm {} +',
    'git branch -d feature',
    'git branch -D feature',
    'git branch -m old new',
    'git branch --delete feature',
    'git branch new-branch',
    'git branch new-branch main',
    'git diff > patch.diff',
    'git diff HEAD~1 >> patch.diff',
    'cat a.txt > b.txt',
    'rg needle src | tee out.txt',
    'git log | Out-File log.txt',
    'Get-Content a.txt | Set-Content b.txt',
    'git stash',
    'git stash pop',
  ])('excludes mutating shell command from read categories: %s', (cmd) => {
    const classification = classifyToolCall({ name: 'Bash', input: { command: cmd } });
    expect(classification.operation).toBe('native-other');
    expect(classification.nativeClass).toBeNull();
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
