import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

type SettingsObject = Record<string, unknown>;
interface SessionBudgetMeasureMigrationLogger {
  warn(message: string): void;
}

const SECTION = 'sessionBudget';
const FLAG = 'sessionBudgetMeasureV1';

function object(value: unknown): value is SettingsObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stored(settings: SettingsObject, key: string): boolean {
  const nested = settings[SECTION];
  if (object(nested) && nested[key] !== undefined) return true;
  return settings[`${SECTION}.${key}`] !== undefined;
}

/**
 * Keep the meaning of a token budget stored before the weighted measure
 * existed. Runs once, before a file settings manager loads defaults: a stored
 * `sessionBudget.tokens` or `sessionBudget.unit` with no stored
 * `sessionBudget.tokenMeasure` gets an explicit `raw`. Every later read then
 * treats an unset measure as `weighted`, so a budget saved after this stamp
 * stays weighted. A missing settings.json is created with only the stamp, so
 * a first save in the same run is not taken for a legacy budget.
 */
export function migrateSessionBudgetMeasure(
  settingsDir: string,
  logger: SessionBudgetMeasureMigrationLogger,
): void {
  const settingsPath = path.join(settingsDir, 'settings.json');
  let parsed: unknown = {};
  if (fs.existsSync(settingsPath)) {
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      logger.warn(
        'Invalid settings.json: session budget measure migration skipped; the file was left unchanged',
      );
      return;
    }
  }
  if (!object(parsed)) {
    logger.warn(
      'Invalid settings.json object: session budget measure migration skipped; the file was left unchanged',
    );
    return;
  }
  const migrations = object(parsed['__migrations'])
    ? parsed['__migrations']
    : {};
  if (migrations[FLAG] === true) return;

  const legacyBudget = stored(parsed, 'tokens') || stored(parsed, 'unit');
  if (legacyBudget && !stored(parsed, 'tokenMeasure')) {
    const section = object(parsed[SECTION]) ? parsed[SECTION] : {};
    parsed[SECTION] = { ...section, tokenMeasure: 'raw' };
  }
  parsed['__migrations'] = { ...migrations, [FLAG]: true };
  fs.mkdirSync(settingsDir, { recursive: true });
  const temp = path.join(
    settingsDir,
    `settings.json.budget-measure-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temp, JSON.stringify(parsed, null, 2), { flag: 'wx' });
    fs.renameSync(temp, settingsPath);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
