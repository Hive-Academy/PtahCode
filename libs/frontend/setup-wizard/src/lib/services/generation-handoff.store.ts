import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { SurfaceRouterService } from '@ptah-extension/core';
import type {
  SetupGenerationRunBinding,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import { startRefusalCopy } from './setup-run-attempt';
import { normalizeSetupWorkspacePath } from './setup-run-persistence';
import { SetupRunStore } from './setup-run.store';
import {
  isTerminalSetupRunStatus,
  type SetupRunRecord,
} from './setup-run.types';
import { WizardRpcError, WizardRpcService } from './wizard-rpc.service';

const HANDOFF_DELAY_MS = 5_000;

export interface GuidanceHandoff {
  agentRunId: string;
  workspacePath: string;
  guidanceStartDeadline: number;
}

@Injectable({ providedIn: 'root' })
export class GenerationHandoffStore {
  private readonly runs = inject(SetupRunStore);
  private readonly router = inject(SurfaceRouterService);
  private readonly rpc = inject(WizardRpcService);
  private readonly pendingValue = signal<GuidanceHandoff | null>(null);
  private readonly startedValue = signal<SetupGenerationRunBinding | null>(
    null,
  );
  private readonly inFlightValue = signal(false);
  private readonly outcomeValue = signal<
    'idle' | 'started' | 'manual-recovery' | 'skipped'
  >('idle');
  private readonly starts = new Map<string, Promise<SetupRunRecord | null>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;

  public readonly pending = this.pendingValue.asReadonly();
  public readonly started = this.startedValue.asReadonly();
  public readonly inFlight = this.inFlightValue.asReadonly();
  public readonly outcome = this.outcomeValue.asReadonly();

  public constructor() {
    effect(() => {
      const pending = this.pendingValue();
      if (pending && !this.parentFor(pending)) this.skip();
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
      this.clearTimer();
    });
  }

  public schedule(agentRunId: string, workspacePath: string): void {
    this.reset('idle');
    this.pendingValue.set({
      agentRunId,
      workspacePath,
      guidanceStartDeadline: Date.now() + HANDOFF_DELAY_MS,
    });
    this.timer = setTimeout(() => void this.startNow(), HANDOFF_DELAY_MS);
  }

  public skip(): void {
    this.reset('skipped');
  }

  public async startNow(): Promise<void> {
    const pending = this.pendingValue();
    if (!pending) return;
    const parent = this.parentFor(pending);
    if (!parent) {
      this.skip();
      return;
    }
    this.clearTimer();
    this.pendingValue.set(null);
    await this.openAndStart(parent.workspacePath, parent);
  }

  public async manualContinue(workspacePath: string): Promise<void> {
    const pending = this.pendingValue();
    this.reset('idle');
    const activeWorkspace = this.runs.workspacePath();
    if (
      !activeWorkspace ||
      activeWorkspace !== normalizeSetupWorkspacePath(workspacePath)
    ) {
      this.outcomeValue.set('manual-recovery');
      return;
    }
    if (
      pending &&
      normalizeSetupWorkspacePath(pending.workspacePath) === activeWorkspace
    ) {
      const parent = this.parentFor(pending);
      if (!parent) {
        this.skip();
        return;
      }
      return this.openAndStart(parent.workspacePath, parent);
    }
    await this.openAndStart(workspacePath, null);
  }

  private reset(outcome: 'idle' | 'skipped'): void {
    this.revision++;
    this.clearTimer();
    this.pendingValue.set(null);
    this.startedValue.set(null);
    this.inFlightValue.set(false);
    this.outcomeValue.set(outcome);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private parentFor(pending: GuidanceHandoff): SetupRunRecord | null {
    const parent = this.runs.get(pending.agentRunId);
    return parent?.workflow === 'agent-generation' &&
      parent.status !== 'cancelled' &&
      !this.runs.isCancelling(parent.id) &&
      parent.workspacePath ===
        normalizeSetupWorkspacePath(pending.workspacePath)
      ? parent
      : null;
  }

  private async openAndStart(
    workspacePath: string,
    parent: SetupRunRecord | null,
  ): Promise<void> {
    const revision = this.revision;
    this.inFlightValue.set(true);
    try {
      const record = await this.startGuidance(workspacePath, parent);
      if (revision !== this.revision) return;
      if (!record || record.status === 'cancelled') {
        this.outcomeValue.set('manual-recovery');
        return;
      }
      const binding = this.runs.bindingFor(record);
      if (binding && record.backendRunId) {
        this.startedValue.set({ ...binding, runId: record.backendRunId });
      }
      this.outcomeValue.set('started');
      if (!parent && this.runs.workspacePath() === record.workspacePath) {
        const { subPath, queryParams } = this.runs.targetOf(record);
        const result = await this.router.navigateToSurface(
          'onboarding',
          subPath,
          {
            queryParams,
          },
        );
        if (result === 'failed' && revision === this.revision) {
          this.outcomeValue.set('manual-recovery');
        }
      }
    } finally {
      if (revision === this.revision) this.inFlightValue.set(false);
    }
  }

  private async startGuidance(
    workspacePath: string,
    parent: SetupRunRecord | null,
  ): Promise<SetupRunRecord | null> {
    const existing = this.runs
      .runsFor(workspacePath)
      .find(
        (run) =>
          run.workflow === 'project-guidance' &&
          !isTerminalSetupRunStatus(run.status),
      );
    if (existing) {
      return (
        this.starts.get(existing.id) ??
        this.runs.whenStarted(existing.id).catch(() => {
          // degradation-audit: reported - a store-owned retry failure sends the hand-off to manual recovery.
          return null;
        })
      );
    }

    const record = this.runs.start('project-guidance', workspacePath, {
      parentId: parent?.id,
      analysisRunId: parent?.analysisRunId,
      origin: parent ? 'analysis-result-continue' : 'independent-start',
    });
    const binding = record && this.runs.bindingFor(record);
    if (!binding) return null;

    const start = this.sendStart(binding);
    this.starts.set(binding.tabId, start);
    try {
      return await start;
    } finally {
      this.starts.delete(binding.tabId);
    }
  }

  private async sendStart(
    binding: SetupGenerationTabBinding,
  ): Promise<SetupRunRecord | null> {
    const id = binding.tabId;
    try {
      return await this.runs.startInitial(binding, async () => {
        const { accepted, rejection } =
          await this.rpc.startBoundGuidance(binding);
        if (accepted) {
          return this.runs.reportRun(id, {
            binding: { ...binding, runId: accepted.runId },
            status: 'starting',
            source: accepted.source,
            effectiveProvider: accepted.effectiveProvider,
            effectiveModel: accepted.effectiveModel,
          });
        }
        if (rejection?.reason === 'blocked' && rejection.ownerTabId) {
          const { owner } = await this.runs.resolveBlockedStart(
            binding,
            rejection.ownerTabId,
          );
          if (owner?.id === id) return owner;
          if (owner) {
            this.failStart(id);
            return owner;
          }
        }
        return this.failStart(id, rejection?.reason);
      });
    } catch (error: unknown) {
      // degradation-audit: reported - the run and handoff show a recoverable start failure.
      return this.failStart(
        id,
        error instanceof WizardRpcError ? error.code : undefined,
      );
    }
  }

  private failStart(id: string, reason?: string): SetupRunRecord | null {
    const record = this.runs.get(id);
    if (record?.backendRunId) return record;
    // Manual recovery keeps non-running statuses such as needs-input intact.
    if (record?.status === 'running') {
      this.runs.report(id, {
        status: 'failed',
        error: startRefusalCopy(reason),
      });
    }
    return null;
  }
}
