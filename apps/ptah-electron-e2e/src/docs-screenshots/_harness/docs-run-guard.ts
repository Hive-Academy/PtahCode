import * as fs from 'fs';
import * as path from 'path';
import type { FullConfig } from '@playwright/test';
import { productionSettingsHash, assertProductionSettingsUnchanged } from './docs-profile';

function baselineFile(config: FullConfig): string {
  const project = config.projects[0];
  if (!project) throw new Error('[docs-capture] no Playwright project configured');
  return path.join(project.outputDir, 'production-settings-baseline.json');
}

export function recordSettingsBaseline(config: FullConfig): void {
  const file = baselineFile(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ hash: productionSettingsHash() ?? null }));
}

export function assertSettingsBaseline(config: FullConfig): void {
  const file = baselineFile(config);
  const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!saved || typeof saved !== 'object' || !('hash' in saved) ||
      (saved.hash !== null && typeof saved.hash !== 'string')) {
    throw new Error('[docs-capture] invalid production settings baseline');
  }
  assertProductionSettingsUnchanged(saved.hash ?? undefined);
  fs.rmSync(file);
}
