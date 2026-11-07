import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Move an Electron config.json threshold into file settings without replacing a newer value. */
export function migrateLegacyCompactionThreshold(
  configPath: string,
  settingsDir: string,
): void {
  if (!fs.existsSync(configPath)) return;
  const config: unknown = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!record(config)) return;
  const threshold = record(config['ptah'])
    ? config['ptah']['compaction.threshold']
    : config['ptah.compaction.threshold'];
  if (threshold === undefined) return;

  const settingsPath = path.join(settingsDir, 'settings.json');
  const settings: unknown = fs.existsSync(settingsPath)
    ? JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    : {};
  if (!record(settings)) throw new Error('Ptah settings must be a JSON object');
  const migrations = record(settings['__migrations']) ? settings['__migrations'] : {};
  if (migrations['legacyCompactionThreshold'] === true) return;
  const compaction = record(settings['compaction']) ? settings['compaction'] : {};
  if (!('threshold' in compaction) && !('compaction.threshold' in settings)) {
    settings['compaction'] = { ...compaction, threshold };
  }
  settings['__migrations'] = { ...migrations, legacyCompactionThreshold: true };
  fs.mkdirSync(settingsDir, { recursive: true });
  const temp = path.join(settingsDir, `settings.json.threshold-${process.pid}-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, JSON.stringify(settings, null, 2), { flag: 'wx' });
    fs.renameSync(temp, settingsPath);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
