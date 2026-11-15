import { performance } from 'node:perf_hooks';
import type { Logger } from '@ptah-extension/vscode-core';

export type Stage =
  | 'accountGate' | 'mcpRegistration' | 'promptRuntime' | 'sdkStart'
  | 'metadataLoad' | 'folderCheck' | 'jsonlRead' | 'cliRestore'
  | 'recoveredOutput' | 'sdkActivation';

const MAX_DURATION_MS = 600_000;

export class ChatAdmissionTiming {
  private readonly durations: Partial<Record<Stage, number>> = {};

  constructor(private readonly logger: Pick<Logger, 'info'>, private readonly method: 'chat:start' | 'chat:resume') {}

  async measure<T>(stage: Stage, operation: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await operation();
    } finally {
      const elapsed = performance.now() - started;
      this.durations[stage] = Number.isFinite(elapsed)
        ? Math.min(MAX_DURATION_MS, Math.max(0, Math.round(elapsed)))
        : MAX_DURATION_MS;
    }
  }

  emit(result: 'ok' | 'error'): void {
    this.logger.info('[RPC] chat admission timing', {
      method: this.method,
      result,
      stages: { ...this.durations },
    });
  }
}
