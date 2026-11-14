import type { SessionUsageContribution } from '@ptah-extension/platform-core';

export interface UsageSourceCursor {
  sourceId: string;
  sourcePath: string;
  fingerprint: string;
  mtimeMs: number;
  byteOffset: number;
  lastEventKey: string | null;
}

export interface UsageCollector {
  readonly sourceId: 'claude-jsonl' | 'codex-rollout';
  collect(path: string, cursor: UsageSourceCursor | null, budgetBytes: number): Promise<{
    events: readonly SessionUsageContribution[];
    next: UsageSourceCursor;
    more: boolean;
  }>;
}
