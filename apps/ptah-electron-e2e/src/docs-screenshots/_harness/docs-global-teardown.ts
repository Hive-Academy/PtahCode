import type { FullConfig } from '@playwright/test';
import { assertSettingsBaseline } from './docs-run-guard';

export default function docsGlobalTeardown(config: FullConfig): void {
  assertSettingsBaseline(config);
}
