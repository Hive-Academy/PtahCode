import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SurfaceRouterService } from '@ptah-extension/core';
import type {
  SetupGenerationRunBinding,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import { startRefusalCopy } from './setup-run/setup-run-binding';
import { sameSetupWorkspacePath } from './setup-run-persistence';
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
  private readonly pendingByParent = signal<
    ReadonlyMap<string, GuidanceHandoff>
  >(new Map());
  private readonly now = signal(Date.now());
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
  private startingParentId: string | undefined;

  /** The first pending hand-off in the workspace shown by the guidance page. */
  public readonly pending = computed(
    () =>
      [...this.pendingByParent().values()].find(
        (entry) =>
          sameSetupWorkspacePath(entry.workspacePath, this.runs.workspacePath()),
      ) ?? null,
  );
  public readonly started = this.startedValue.asReadonly();
  public readonly inFlight = this.inFlightValue.asReadonly();
  public readonly outcome = this.outcomeValue.asReadonly();

  public constructor() {
    effect(() => {
      const invalid = [...this.pendingByParent().values()].filter(
        (entry) => !this.parentFor(entry),
      );
      const next = this.nextPending();
      untracked(() => {
        for (const entry of invalid) this.skip(entry.agentRunId);
        this.arm(invalid.length ? this.nextPending() : next);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
      this.clearTimer();
    });
  }

  public pendingFor(agentRunId: string): GuidanceHandoff | null {
    return this.pendingByParent().get(agentRunId) ?? null;
  }

  public remainingSeconds(agentRunId: string): number {
    const deadline =
      this.pendingFor(agentRunId)?.guidanceStartDeadline ?? this.now();
    return Math.max(0, Math.ceil((deadline - this.now()) / 1_000));
  }

  public schedule(agentRunId: string, workspacePath: string): void {
    const parent = this.runs.get(agentRunId);
    if (!parent || this.pendingFor(agentRunId)) return;
    const state = parent.guidanceHandoff;
    if (state === 'skipped' || state === 'consumed') return;
    const guidanceStartDeadline = state ?? Date.now() + HANDOFF_DELAY_MS;
    this.runs.setGuidanceHandoff(agentRunId, guidanceStartDeadline);
    this.pendingByParent.update((current) =>
      new Map(current).set(agentRunId, {
        agentRunId,
        workspacePath,
        guidanceStartDeadline,
      }),
    );
    this.arm(this.nextPending());
  }

  public skip(
    agentRunId = this.pending()?.agentRunId ?? this.startingParentId,
  ): void {
    if (
      !agentRunId ||
      (!this.pendingFor(agentRunId) && this.startingParentId !== agentRunId)
    )
      return;
    this.removePending(agentRunId);
    this.runs.setGuidanceHandoff(agentRunId, 'skipped');
    if (
      this.startingParentId === agentRunId ||
      (!this.inFlight() && !this.started())
    )
      this.reset('skipped');
    this.arm(this.nextPending());
  }

  public async startNow(
    agentRunId = this.pending()?.agentRunId,
  ): Promise<void> {
    const pending = agentRunId && this.pendingFor(agentRunId);
    if (!pending) return;
    const parent = this.parentFor(pending);
    if (!parent) {
      this.skip(pending.agentRunId);
      return;
    }
    if (
      !sameSetupWorkspacePath(parent.workspacePath, this.runs.workspacePath()) ||
      this.waitsForGuidance(parent)
    )
      return;
    this.removePending(parent.id);
    this.runs.setGuidanceHandoff(parent.id, 'consumed');
    if (this.hasGuidanceChild(parent)) return;
    this.reset('idle');
    await this.openAndStart(parent.workspacePath, parent);
  }

  public async manualContinue(
    workspacePath: string,
    agentRunId?: string,
  ): Promise<void> {
    const activeWorkspace = this.runs.workspacePath();
    if (
      !activeWorkspace ||
      !sameSetupWorkspacePath(activeWorkspace, workspacePath)
    ) {
      this.outcomeValue.set('manual-recovery');
      return;
    }
    const pending = agentRunId ? this.pendingFor(agentRunId) : this.pending();
    if (pending) return this.startNow(pending.agentRunId);
    const parent = agentRunId ? this.runs.get(agentRunId) : null;
    if (
      agentRunId &&
      (parent?.workflow !== 'agent-generation' ||
        parent.status !== 'completed' ||
        !sameSetupWorkspacePath(parent.workspacePath, activeWorkspace) ||
        this.waitsForGuidance(parent))
    )
      return;
    if (parent) this.runs.setGuidanceHandoff(parent.id, 'consumed');
    this.reset('idle');
    await this.openAndStart(activeWorkspace, parent);
  }

  private reset(outcome: 'idle' | 'skipped'): void {
    this.revision++;
    this.startingParentId = undefined;
    this.startedValue.set(null);
    this.inFlightValue.set(false);
    this.outcomeValue.set(outcome);
  }

  private removePending(id: string): void {
    this.pendingByParent.update((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }

  private nextPending(): GuidanceHandoff | undefined {
    const workspace = this.runs.workspacePath();
    let next: GuidanceHandoff | undefined;
    for (const entry of this.pendingByParent().values()) {
      const parent = this.parentFor(entry);
      if (
        !parent ||
        !sameSetupWorkspacePath(parent.workspacePath, workspace) ||
        (entry.guidanceStartDeadline <= Date.now() &&
          this.waitsForGuidance(parent))
      )
        continue;
      if (!next || entry.guidanceStartDeadline < next.guidanceStartDeadline)
        next = entry;
    }
    return next;
  }

  private waitsForGuidance(parent: SetupRunRecord): boolean {
    return this.runs
      .runsFor(parent.workspacePath)
      .some(
        (run) =>
          run.workflow === 'project-guidance' &&
          run.parentId !== null &&
          run.parentId !== parent.id &&
          !isTerminalSetupRunStatus(run.status),
      );
  }

  private hasGuidanceChild(parent: SetupRunRecord): boolean {
    return this.runs
      .runsFor(parent.workspacePath)
      .some(
        (run) =>
          run.workflow === 'project-guidance' && run.parentId === parent.id,
      );
  }

  private arm(next: GuidanceHandoff | undefined): void {
    this.clearTimer();
    const now = Date.now();
    this.now.set(now);
    if (!next) return;
    this.timer = setTimeout(
      () => {
        if (next.guidanceStartDeadline <= Date.now())
          void this.startNow(next.agentRunId);
        this.arm(this.nextPending());
      },
      Math.min(1_000, Math.max(0, next.guidanceStartDeadline - now)),
    );
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
      sameSetupWorkspacePath(parent.workspacePath, pending.workspacePath)
      ? parent
      : null;
  }

  private async openAndStart(
    workspacePath: string,
    parent: SetupRunRecord | null,
  ): Promise<void> {
    const revision = this.revision;
    this.startingParentId = parent?.id;
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
      if (!parent && sameSetupWorkspacePath(this.runs.workspacePath(), record.workspacePath)) {
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
      if (revision === this.revision) {
        this.startingParentId = undefined;
        this.inFlightValue.set(false);
      }
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
