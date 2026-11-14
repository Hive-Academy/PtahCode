import path from 'node:path';
import { ClaudeUsageSourceRegistry } from './usage-source-registry';

describe('ClaudeUsageSourceRegistry', () => {
  it('uses the ambient Claude config directory for project replay', async () => {
    const previous = process.env['CLAUDE_CONFIG_DIR'];
    process.env['CLAUDE_CONFIG_DIR'] = path.join('profile', 'claude');
    try {
      const registry = new ClaudeUsageSourceRegistry({ listActiveRoots: async () => [] });
      expect(await registry.listRoots()).toContain(path.join('profile', 'claude', 'projects'));
    } finally {
      if (previous === undefined) delete process.env['CLAUDE_CONFIG_DIR'];
      else process.env['CLAUDE_CONFIG_DIR'] = previous;
    }
  });
});
