import {
  addCall,
  classifyShell,
  emptyCounts,
  ptahToolOf,
} from './count-nav-calls';

describe('count-nav-calls', () => {
  it('classifies grep, sed ranges and cat', () => {
    expect(classifyShell("rg -n 'foo' libs")).toEqual(['shell-grep']);
    expect(classifyShell("sed -n '10,40p' a.ts")).toEqual(['shell-sed-range']);
    expect(classifyShell('cat a.ts')).toEqual(['shell-cat']);
    expect(classifyShell("nl -ba a.ts | sed -n '1,5p'")).toEqual([
      'shell-sed-range',
    ]);
    expect(classifyShell('git status')).toEqual([]);
  });

  it('recognises ptah tools with and without the MCP prefix', () => {
    expect(ptahToolOf('mcp__ptah__ptah_grep')).toBe('ptah_grep');
    expect(ptahToolOf('ptah_read_symbol')).toBe('ptah_read_symbol');
    expect(ptahToolOf('mcp__ptah__ptah_agent_spawn')).toBeUndefined();
    expect(ptahToolOf('Bash')).toBeUndefined();
  });

  it('counts every call once in total', () => {
    const counts = emptyCounts();
    addCall(counts, 'Bash', "rg foo | sed -n '1,2p'");
    addCall(counts, 'Read', undefined);
    addCall(counts, 'mcp__ptah__ptah_grep', undefined);
    addCall(counts, 'Bash', 'ls');
    expect(counts.total).toBe(4);
    expect(counts['shell-grep']).toBe(1);
    expect(counts['shell-sed-range']).toBe(1);
    expect(counts.read).toBe(1);
    expect(counts['ptah-nav']).toBe(1);
    expect(counts.other).toBe(1);
    expect(counts.perPtahTool).toEqual({ ptah_grep: 1 });
  });
});
