import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  GenerationContextSource,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import { hasCommittedGuidance } from './setup-run-attempt';
import { SetupRunStore } from './setup-run.store';
import type { SetupRunRecord } from './setup-run.types';
import { WizardRpcService } from './wizard-rpc.service';

export type GuidanceRunStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'cancelling'
  | 'stop-unknown'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'timed-out'
  | 'unknown';

export interface GuidanceSnapshot {
  runId: string;
  sourceLabel: string;
  provider: string | null;
  model: string | null;
}

export interface GuidanceCommittedResult {
  generatedAt: string | null;
  enabled: boolean;
  cacheValid: boolean;
  invalidationReason?: string;
}

function sourceLabel(source: GenerationContextSource): string {
  return source.kind === 'verified-analysis'
    ? 'Verified latest analysis'
    : `Workspace discovery (${source.reason})`;
}

/**
 * The committed guidance and its run, bound to a project-guidance Setup run
 * record (`binding.tabId` is the record id). Verified run states are
 * reported to `SetupRunStore`.
 */
@Injectable({ providedIn: 'root' })
export class GuidanceGenerationStore {
  private readonly rpc = inject(WizardRpcService);
  private readonly runs = inject(SetupRunStore);
  private readonly bindingValue = signal<SetupGenerationTabBinding | null>(
    null,
  );
  private readonly runValue = signal<SetupGenerationRunState | null>(null);
  private readonly statusValue = signal<GuidanceRunStatus>('idle');
  private readonly snapshotValue = signal<GuidanceSnapshot | null>(null);
  private readonly resultValue = signal<GuidanceCommittedResult | null>(null);
  private restoring = false;
  readonly binding = this.bindingValue.asReadonly();
  readonly run = this.runValue.asReadonly();
  readonly status = this.statusValue.asReadonly();
  readonly snapshot = this.snapshotValue.asReadonly();
  readonly result = this.resultValue.asReadonly();
  readonly content = signal<string | null>(null);
  readonly actionFailed = signal(false);
  readonly source = computed(() => this.snapshotValue()?.sourceLabel ?? null);

  bind(binding: SetupGenerationTabBinding): void {
    if (binding.workflow !== 'setup-project-prompt') return;
    const old = this.bindingValue();
    if (
      old?.tabId === binding.tabId &&
      old.workspacePath === binding.workspacePath
    )
      return;
    this.restoring = true;
    this.bindingValue.set(binding);
    this.runValue.set(null);
    this.snapshotValue.set(null);
    this.resultValue.set(null);
    this.statusValue.set('idle');
    this.content.set(null);
    void this.refresh();
  }

  /** Show a project-guidance Setup run record. */
  bindRecord(record: SetupRunRecord): boolean {
    const binding = this.runs.bindingFor(record);
    if (binding?.workflow !== 'setup-project-prompt') return false;
    this.bind(binding);
    return true;
  }

  unbind(): void {
    this.restoring = false;
    this.bindingValue.set(null);
    this.runValue.set(null);
    this.snapshotValue.set(null);
    this.resultValue.set(null);
    this.statusValue.set('idle');
    this.content.set(null);
  }

  adopt(run: SetupGenerationRunState, acceptedThisSession = false): void {
    const binding = this.bindingValue();
    if (!binding || !this.sameBinding(run.binding)) return;
    const changedRun = this.snapshotValue()?.runId !== run.binding.runId;
    const changedStatus = this.runValue()?.status !== run.status;
    if (changedRun) {
      this.runValue.set(null);
      this.snapshotValue.set(null);
      this.statusValue.set('starting');
    }
    if (acceptedThisSession || !this.isTerminal(run.status))
      this.restoring = false;
    if (changedRun) this.accept(run);
    this.applyRun(run);
    if (
      changedRun ||
      (changedStatus &&
        ['completed', 'failed', 'cancelled', 'timed-out'].includes(run.status))
    )
      void this.refreshCommitted(binding);
  }

  private accept(accepted: SetupGenerationRunState): void {
    this.snapshotValue.set({
      runId: accepted.binding.runId,
      sourceLabel: sourceLabel(accepted.source),
      provider:
        accepted.effectiveProvider === 'unknown'
          ? null
          : accepted.effectiveProvider,
      model:
        accepted.effectiveModel === 'unknown' ? null : accepted.effectiveModel,
    });
  }

  async refresh(): Promise<void> {
    const binding = this.bindingValue();
    if (!binding) return;
    const requestedRunId = this.snapshotValue()?.runId;
    let run: SetupGenerationRunState | null = null;
    try {
      run = await this.rpc.getBoundRunState(binding, requestedRunId);
    } catch {
      // degradation-audit: reported - an unreadable run state shows the `unknown` status.
      if (this.sameBinding(binding)) this.statusValue.set('unknown');
    }
    if (!this.sameBinding(binding)) return;
    if (requestedRunId !== this.snapshotValue()?.runId) return;
    if (
      run &&
      run.binding.tabId === binding.tabId &&
      run.binding.workspacePath === binding.workspacePath &&
      run.binding.workflow === binding.workflow &&
      (!this.snapshotValue() ||
        run.binding.runId === this.snapshotValue()?.runId)
    ) {
      if (this.snapshotValue()?.runId !== run.binding.runId) this.accept(run);
      this.applyRun(run);
    } else if (!run && this.statusValue() === 'starting') {
      this.statusValue.set('unknown');
    }
    await this.refreshCommitted(binding);
  }

  private applyRun(run: SetupGenerationRunState): void {
    this.runValue.set(run);
    this.report(run);
    const terminal = ['completed', 'cancelled', 'failed', 'timed-out'].includes(
      run.status,
    );
    this.statusValue.set(
      this.restoring && terminal && run.status !== 'cancelled'
        ? 'idle'
        : run.status === 'completed' && !hasCommittedGuidance(run)
          ? 'failed'
          : run.status,
    );
    if (!terminal) this.restoring = false;
  }

  /** Sync a verified run onto its record; adopt only a live run. */
  private report(run: SetupGenerationRunState): void {
    const binding = this.bindingValue();
    if (!binding) return;
    const record =
      this.runs.get(binding.tabId) ??
      (this.isTerminal(run.status) ? null : this.runs.adopt(binding));
    if (record) this.runs.reportRun(record.id, run);
  }

  private isTerminal(status: SetupGenerationRunState['status']): boolean {
    return ['completed', 'cancelled', 'failed', 'timed-out'].includes(status);
  }

  async refreshCommitted(binding = this.bindingValue()): Promise<void> {
    if (!binding) return;
    try {
      const status = await this.rpc.getEnhancedPromptsStatus(
        binding.workspacePath,
      );
      if (this.sameBinding(binding) && !status.error) {
        if (
          this.resultValue()?.generatedAt !==
          (status.hasGeneratedPrompt ? status.generatedAt : null)
        )
          this.content.set(null);
        this.resultValue.set(
          status.hasGeneratedPrompt
            ? {
                generatedAt: status.generatedAt,
                enabled: status.enabled,
                cacheValid: status.cacheValid,
                invalidationReason: status.invalidationReason,
              }
            : null,
        );
      }
    } catch {
      // degradation-audit: reported - an unreadable guidance status sets actionFailed.
      if (this.sameBinding(binding)) this.actionFailed.set(true);
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const binding = this.bindingValue();
    if (!binding) return;
    this.actionFailed.set(false);
    try {
      await this.rpc.toggleEnhancedPrompts(binding.workspacePath, enabled);
      await this.refreshCommitted(binding);
    } catch {
      // degradation-audit: reported - a failed toggle sets actionFailed and rereads the committed state.
      if (this.sameBinding(binding)) {
        this.actionFailed.set(true);
        await this.refreshCommitted(binding);
      }
    }
  }

  async loadContent(): Promise<void> {
    const binding = this.bindingValue();
    if (!binding) return;
    this.actionFailed.set(false);
    try {
      const content = await this.rpc.getEnhancedPromptContent(
        binding.workspacePath,
      );
      if (this.sameBinding(binding)) {
        this.content.set(content);
        if (content === null) this.actionFailed.set(true);
      }
    } catch {
      // degradation-audit: reported - unreadable guidance content sets actionFailed.
      if (this.sameBinding(binding)) this.actionFailed.set(true);
    }
  }

  async download(): Promise<void> {
    const binding = this.bindingValue();
    if (!binding) return;
    this.actionFailed.set(false);
    try {
      const result = await this.rpc.downloadEnhancedPrompt(
        binding.workspacePath,
      );
      if (this.sameBinding(binding)) this.actionFailed.set(!result.success);
    } catch {
      // degradation-audit: reported - a failed download sets actionFailed.
      if (this.sameBinding(binding)) this.actionFailed.set(true);
    }
  }

  private sameBinding(binding: SetupGenerationTabBinding): boolean {
    const current = this.bindingValue();
    return (
      current?.tabId === binding.tabId &&
      current.workspacePath === binding.workspacePath &&
      current.workflow === binding.workflow
    );
  }
}
