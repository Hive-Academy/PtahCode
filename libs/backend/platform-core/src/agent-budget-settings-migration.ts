import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { findAdvancedSetting, validateAdvancedSettingValue } from '@ptah-extension/shared';

type SettingsObject = Record<string, unknown>;
interface AgentBudgetMigrationLogger { warn(message: string): void }

function object(value: unknown): value is SettingsObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stored(settings: SettingsObject, section: string, key: string): { present: boolean; value: unknown } {
  const nested = settings[section];
  if (object(nested) && Object.prototype.hasOwnProperty.call(nested, key)) {
    return { present: true, value: nested[key] };
  }
  const flatKey = `${section}.${key}`;
  return { present: Object.prototype.hasOwnProperty.call(settings, flatKey), value: settings[flatKey] };
}

/** Migrate each legacy budget key once, before a file settings manager loads defaults. */
export function migrateAgentBudgetSettings(settingsDir: string, logger: AgentBudgetMigrationLogger): void {
  const settingsPath = path.join(settingsDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    logger.warn('Invalid settings.json: agent budget migration skipped; the file was left unchanged');
    return;
  }
  if (!object(parsed)) {
    logger.warn('Invalid settings.json object: agent budget migration skipped; the file was left unchanged');
    return;
  }
  const migrations = object(parsed['__migrations']) ? parsed['__migrations'] : {};
  if (migrations['agentBudgetV1'] === true) return;

  const budget = object(parsed['agentBudget']) ? { ...parsed['agentBudget'] } : {};
  const mappings = [
    ['subagentHandoffTokens', 'handoffContextTokens'],
    ['subagentStopWeightedTokens', 'stopWeightedTokens'],
  ] as const;
  for (const [oldKey, newKey] of mappings) {
    if (stored(parsed, 'agentBudget', newKey).present) continue;
    const old = stored(parsed, 'compaction', oldKey);
    if (!old.present) continue;
    const descriptor = findAdvancedSetting(`agentBudget.${newKey}`);
    if (!descriptor || descriptor.kind !== 'number') throw new Error(`Missing agent budget descriptor: ${newKey}`);
    const parsedValue = z.number().finite().safeParse(old.value);
    const result = validateAdvancedSettingValue(descriptor, parsedValue.success ? parsedValue.data : old.value);
    budget[newKey] = result.ok ? result.value : descriptor.default;
    if (!result.ok) logger.warn(`Invalid legacy compaction.${oldKey}; using agentBudget.${newKey} default`);
  }
  parsed['agentBudget'] = budget;
  parsed['__migrations'] = { ...migrations, agentBudgetV1: true };
  const temp = path.join(settingsDir, `settings.json.agent-budget-${process.pid}-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, JSON.stringify(parsed, null, 2), { flag: 'wx' });
    fs.renameSync(temp, settingsPath);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
