import type { FullConfig } from '@playwright/test';
import buildPrecheck from '../../support/build-precheck';
import { recordSettingsBaseline } from './docs-run-guard';

export default async function docsGlobalSetup(config: FullConfig): Promise<void> {
  await buildPrecheck();
  recordSettingsBaseline(config);
}
