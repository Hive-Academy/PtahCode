import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { migrateLegacyCompactionThreshold } from './legacy-threshold-migration';
import { PtahFileSettingsManager } from './file-settings-manager';

describe('migrateLegacyCompactionThreshold', () => {
  it('moves an old Electron value once and leaves a user-cleared value cleared', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-threshold-'));
    try {
      const configPath = path.join(root, 'config.json');
      const settingsDir = path.join(root, '.ptah');
      fs.writeFileSync(configPath, JSON.stringify({ ptah: { 'compaction.threshold': 350000 } }));
      migrateLegacyCompactionThreshold(configPath, settingsDir);
      const settingsPath = path.join(settingsDir, 'settings.json');
      expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).compaction.threshold).toBe(350000);
      expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).__migrations.legacyCompactionThreshold).toBe(true);
      await new PtahFileSettingsManager({}, settingsDir).set('compaction.threshold', undefined);
      fs.writeFileSync(configPath, JSON.stringify({ ptah: { 'compaction.threshold': 400000 } }));
      migrateLegacyCompactionThreshold(configPath, settingsDir);
      expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).compaction?.threshold).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves an existing file value and marks the legacy source consumed', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-threshold-existing-'));
    try {
      const configPath = path.join(root, 'config.json');
      const settingsDir = path.join(root, '.ptah');
      fs.mkdirSync(settingsDir);
      fs.writeFileSync(configPath, JSON.stringify({ ptah: { 'compaction.threshold': 350000 } }));
      const settingsPath = path.join(settingsDir, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify({ compaction: { threshold: 450000 } }));
      migrateLegacyCompactionThreshold(configPath, settingsDir);
      expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).compaction.threshold).toBe(450000);
      await new PtahFileSettingsManager({}, settingsDir).set('compaction.threshold', undefined);
      migrateLegacyCompactionThreshold(configPath, settingsDir);
      expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).compaction?.threshold).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
