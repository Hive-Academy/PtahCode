import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CliWorkspaceProvider } from './cli-workspace-provider';

describe('CLI legacy compaction threshold', () => {
  it.each(['config.json', 'global-state.json'])(
    'moves %s once and lets the user clear it',
    async (fileName) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-cli-threshold-'));
      try {
        const legacy = fileName === 'config.json'
          ? { ptah: { 'compaction.threshold': 250000 } }
          : { 'ptah.compaction.threshold': 250000 };
        fs.writeFileSync(path.join(root, fileName), JSON.stringify(legacy));
        const first = new CliWorkspaceProvider(root);
        expect(first.getConfiguration('ptah', 'compaction.threshold')).toBe(250000);
        await first.setConfiguration('ptah', 'compaction.threshold', undefined);
        const second = new CliWorkspaceProvider(root);
        expect(second.getConfiguration('ptah', 'compaction.threshold')).toBeUndefined();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
