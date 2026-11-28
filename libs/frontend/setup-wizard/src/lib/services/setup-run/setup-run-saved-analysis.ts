import { signal } from '@angular/core';
import { isOnboardingIdentityValue } from '@ptah-extension/core';
import type { MultiPhaseManifestV4 } from '@ptah-extension/shared';
import { normalizeSetupWorkspacePath } from '../setup-run-persistence';
import type { SetupRunRecord } from '../setup-run.types';
import type { WizardRpcService } from '../wizard-rpc.service';
import { isLive, newRunId, type SetupRunRecordHost } from './setup-run-host';

const DISCOVERY_ERROR = 'Could not check for saved workspace analyses.';
const RECOVERY_BATCH_SIZE = 4;

export class SetupRunSavedAnalysis {
  private readonly errors = signal<ReadonlyMap<string, string>>(new Map());
  private readonly pending = signal<ReadonlyMap<string, Promise<void>>>(
    new Map(),
  );

  public constructor(
    private readonly host: SetupRunRecordHost,
    private readonly rpc: WizardRpcService,
  ) {}

  public errorFor(workspacePath: string | null): string | null {
    if (!workspacePath) return null;
    return (
      this.errors().get(normalizeSetupWorkspacePath(workspacePath) ?? '') ??
      null
    );
  }

  public isDiscovering(workspacePath: string | null): boolean {
    if (!workspacePath) return false;
    return this.pending().has(normalizeSetupWorkspacePath(workspacePath) ?? '');
  }

  public discover(workspacePath: string): Promise<void> {
    const key = normalizeSetupWorkspacePath(workspacePath);
    if (!key) return Promise.resolve();
    const current = this.pending().get(key);
    if (current) return current;

    const request = this.read(workspacePath)
      .then(
        () =>
          this.errors.update((errors) => {
            if (!errors.has(key)) return errors;
            const next = new Map(errors);
            next.delete(key);
            return next;
          }),
        () =>
          this.errors.update((errors) =>
            new Map(errors).set(key, DISCOVERY_ERROR),
          ),
      )
      .finally(() =>
        this.pending.update((pending) => {
          const next = new Map(pending);
          next.delete(key);
          return next;
        }),
      );
    this.pending.update((pending) => new Map(pending).set(key, request));
    return request;
  }

  public async rediscover(workspacePath: string): Promise<void> {
    const key = normalizeSetupWorkspacePath(workspacePath);
    const pending = key && this.pending().get(key);
    if (pending) await pending;
    await this.discover(workspacePath);
  }

  private async read(workspacePath: string): Promise<void> {
    const status = await this.rpc.getAnalysisStatus(workspacePath);
    if (status.reason === 'unreadable') throw new Error(DISCOVERY_ERROR);
    if (status.state === 'missing') return;

    const saved = status.savedRun;
    const freshness = { state: status.state, reason: status.reason };
    if (saved && isOnboardingIdentityValue(saved.runId)) {
      this.observe(
        workspacePath,
        saved.runId,
        saved.lifecycle,
        status.analyzedAt,
        saved.updatedAt,
        freshness,
      );
      if (saved.lifecycle === 'completed') return;
    }

    // Freshness describes the latest manifest, which can be an unfinished run.
    // Restore the latest completed result as well, with its own identity.
    const entries = await this.rpc.listAnalyses({
      workspacePath,
      throwOnError: true,
    });
    const completed = entries.find((entry) => entry.lifecycle === 'completed');
    if (!completed) return;
    if (!isOnboardingIdentityValue(completed.runId)) {
      // Older hosts provide the filename but omit identity from the listing.
      const { manifest } = await this.rpc.loadAnalysis(
        completed.filename,
        workspacePath,
      );
      if (
        manifest.lifecycle === 'completed' &&
        isOnboardingIdentityValue(manifest.runId)
      ) {
        this.observe(
          workspacePath,
          manifest.runId,
          'completed',
          manifest.analyzedAt,
          manifest.updatedAt,
          !saved &&
            status.reason !== 'incomplete' &&
            status.analyzedAt === manifest.analyzedAt
            ? freshness
            : undefined,
        );
      }
      return;
    }
    this.observe(
      workspacePath,
      completed.runId,
      'completed',
      completed.savedAt,
      completed.updatedAt,
    );
  }

  private observe(
    workspacePath: string,
    runId: string,
    lifecycle: MultiPhaseManifestV4['lifecycle'],
    analyzedAt: string | null,
    updatedAt?: string,
    freshness?: SetupRunRecord['analysisFreshness'],
  ): void {
    const analyses = this.host
      .runsFor(workspacePath)
      .filter((record) => record.workflow === 'analysis');
    const existing = analyses.find(
      (record) =>
        record.backendRunId === runId || record.analysisRunId === runId,
    );
    if (existing) {
      if (freshness) {
        this.host.patch(existing.id, (record) =>
          record.analysisFreshness?.state === freshness.state &&
          record.analysisFreshness.reason === freshness.reason
            ? record
            : { ...record, analysisFreshness: freshness },
        );
      }
      return;
    }
    if (
      lifecycle !== 'completed' ||
      this.host.wasDismissed(workspacePath, 'analysis', runId)
    )
      return;

    const started = Date.parse(analyzedAt ?? '');
    const changed = Date.parse(updatedAt ?? '');
    // A live record can report its identity just after the backend saves it.
    if (
      analyses.some(
        (record) =>
          isLive(record) &&
          !record.backendRunId &&
          !record.analysisRunId &&
          (Number.isFinite(changed) ? changed : started) >= record.createdAt,
      )
    )
      return;
    const createdAt = Number.isFinite(started) ? started : Date.now();
    this.host.insert({
      id: newRunId(),
      workspacePath,
      workflow: 'analysis',
      status: 'completed',
      step: 'analyzing',
      backendRunId: runId,
      analysisRunId: runId,
      parentId: null,
      unseen: false,
      createdAt,
      updatedAt:
        Number.isFinite(changed) && changed >= createdAt ? changed : createdAt,
      ...(freshness ? { analysisFreshness: freshness } : {}),
    });
  }

  /** Find a completed manifest for an interrupted renderer-side analysis. */
  public async recover(
    record: SetupRunRecord,
    isCurrent: () => boolean,
  ): Promise<string | null> {
    const { workspacePath, backendRunId } = record;
    if (backendRunId) {
      const { manifest } = await this.rpc.loadAnalysis(
        backendRunId,
        workspacePath,
      );
      return manifest.lifecycle === 'completed' &&
        manifest.runId === backendRunId
        ? backendRunId
        : null;
    }

    const entries = (
      await this.rpc.listAnalyses({ workspacePath, throwOnError: true })
    ).filter((item) => item.lifecycle === 'completed');
    const matches = (runId: string, updatedAt: string) =>
      isOnboardingIdentityValue(runId) &&
      Date.parse(updatedAt) >= record.createdAt;

    for (
      let i = 0;
      i < entries.length && isCurrent();
      i += RECOVERY_BATCH_SIZE
    ) {
      const batch = await Promise.allSettled(
        entries.slice(i, i + RECOVERY_BATCH_SIZE).map(async (entry) => {
          if (entry.runId && entry.updatedAt) {
            return matches(entry.runId, entry.updatedAt) ? entry.runId : null;
          }
          // Older hosts expose only the slug and original savedAt in the list.
          const { manifest } = await this.rpc.loadAnalysis(
            entry.filename,
            workspacePath,
          );
          return manifest.lifecycle === 'completed' &&
            matches(manifest.runId, manifest.updatedAt ?? manifest.analyzedAt)
            ? manifest.runId
            : null;
        }),
      );
      for (const result of batch) {
        if (result.status === 'fulfilled' && result.value) return result.value;
        if (result.status === 'rejected') {
          console.warn(
            '[setup-run-analysis] A saved analysis could not be read during recovery.',
          );
        }
      }
    }
    return null;
  }
}
