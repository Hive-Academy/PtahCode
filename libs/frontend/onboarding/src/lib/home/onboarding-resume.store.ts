import { Injectable, computed, inject, signal } from '@angular/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  VSCodeService,
  onboardingGenerationTarget,
  type OnboardingTarget,
} from '@ptah-extension/core';
import {
  WizardAnalysisRunner,
  WizardRpcService,
} from '@ptah-extension/setup-wizard';
import type { SetupGenerationWorkflow } from '@ptah-extension/shared';
import type { OnboardingRunChipState } from '../shared/run-status-chip.component';

export type OnboardingResumeState = Extract<
  OnboardingRunChipState,
  'running' | 'cancelling' | 'resumable'
>;

export interface OnboardingResumeItem {
  readonly id: string;
  readonly state: OnboardingResumeState;
  readonly title: string;
  readonly detail: string | null;
  readonly target: OnboardingTarget;
}

const ANALYSIS_TARGET: OnboardingTarget = {
  subPath: ['analyze'],
  queryParams: {},
};

const ACTIVE_BOUND_RUN_STATUSES: ReadonlySet<string> = new Set([
  'running',
  'starting',
  'quiet',
]);

/** Bounded Home discovery: the latest checkpoint pair and one tab per workflow. */
@Injectable({ providedIn: 'root' })
export class OnboardingResumeStore {
  private readonly rpc = inject(WizardRpcService);
  private readonly runner = inject(WizardAnalysisRunner);
  private readonly tabs = inject(TabManagerService);
  private readonly vscode = inject(VSCodeService);
  private readonly _discoveredItems = signal<readonly OnboardingResumeItem[]>(
    [],
  );
  private readonly _activeRoot = signal<string | null>(null);
  private readonly _cleared = signal(false);
  private refreshSequence = 0;

  readonly items = computed<readonly OnboardingResumeItem[]>(() => {
    if (this._cleared()) {
      return [];
    }
    const root = this._activeRoot() ?? this.currentRoot();
    const discovered = this._discoveredItems();
    const liveAnalysis = this.liveAnalysisItem(root);
    if (!liveAnalysis) {
      return discovered;
    }
    return [
      liveAnalysis,
      ...discovered.filter((item) => item.id !== 'analysis'),
    ];
  });

  clear(): void {
    this.refreshSequence++;
    this._cleared.set(true);
    this._activeRoot.set(null);
    this._discoveredItems.set([]);
  }

  private currentRoot(): string | null {
    return (
      this.tabs.activeWorkspacePath ||
      this.vscode.config().workspaceRoot ||
      null
    );
  }

  private isRunnerActiveFor(root: string | null): boolean {
    if (!root) return false;
    if (typeof this.runner.isRunningForWorkspace === 'function') {
      return this.runner.isRunningForWorkspace(root);
    }
    return this.runner.isRunning() || this.runner.isCanceling();
  }

  private liveAnalysisItem(root: string | null): OnboardingResumeItem | null {
    if (!this.isRunnerActiveFor(root)) {
      return null;
    }
    if (this.runner.isCanceling()) {
      return {
        id: 'analysis',
        state: 'cancelling',
        title: 'Stopping workspace analysis',
        detail: null,
        target: ANALYSIS_TARGET,
      };
    }
    return {
      id: 'analysis',
      state: 'running',
      title: 'Workspace analysis in progress',
      detail: null,
      target: ANALYSIS_TARGET,
    };
  }

  async refresh(): Promise<void> {
    const sequence = ++this.refreshSequence;
    const root = this.currentRoot();
    this._cleared.set(false);
    this._activeRoot.set(root);
    this._discoveredItems.set([]);
    if (!root) {
      return;
    }
    const found: OnboardingResumeItem[] = [];
    const tabs = this.tabs.getWorkspaceTabs(root);
    let latest: Awaited<
      ReturnType<WizardRpcService['getResumableRun']>
    > | null = null;
    try {
      latest = await this.rpc.getResumableRun();
    } catch {
      // degradation-audit: optional-capability - bound generation tabs can still be resumed when resumable-run lookup fails
    }
    if (sequence !== this.refreshSequence) return;

    if (latest?.analysisActive === true && !this.runner.isRunning()) {
      this.runner.syncBackendActive?.(true, {
        startedAt: latest.activeAnalysisStartedAt,
        workspacePath: root,
      });
    } else if (
      latest?.analysisActive === false &&
      this.isRunnerActiveFor(root) &&
      (this.runner.backendActive?.() === true ||
        this.runner.backendActive === undefined)
    ) {
      this.runner.syncBackendActive?.(false, { analysis: latest.analysis });
    }

    const runnerActive = this.isRunnerActiveFor(root);
    if (runnerActive) {
      // Live analysis banner is synthesized reactively by `items`.
    } else if (latest?.analysisActive === true) {
      found.push({
        id: 'analysis',
        state: 'running',
        title: 'Workspace analysis in progress',
        detail: null,
        target: ANALYSIS_TARGET,
      });
    } else if (
      latest?.analysis &&
      latest.analysis.manifest.lifecycle !== 'completed'
    ) {
      found.push({
        id: 'analysis',
        state: 'resumable',
        title: 'Continue workspace analysis',
        detail: null,
        target: ANALYSIS_TARGET,
      });
    }

    const workflows: readonly SetupGenerationWorkflow[] = [
      'setup-agent-generation',
      'setup-project-prompt',
    ];
    for (const workflow of workflows) {
      const tab = tabs.find((candidate) => candidate.workflow === workflow);
      if (!tab) continue;
      try {
        const run = await this.rpc.getBoundRunState({
          tabId: tab.id,
          workflow,
          workspacePath: root,
        });
        if (run && !['completed', 'cancelled'].includes(run.status)) {
          const isCancelling = run.status === 'cancelling';
          const isRunning = ACTIVE_BOUND_RUN_STATUSES.has(run.status);
          const state: OnboardingResumeState = isCancelling
            ? 'cancelling'
            : isRunning
              ? 'running'
              : 'resumable';
          const title =
            workflow === 'setup-agent-generation'
              ? isCancelling
                ? 'Stopping agent generation'
                : isRunning
                  ? 'Agent generation in progress'
                  : 'Continue agent generation'
              : isCancelling
                ? 'Stopping project guidance'
                : isRunning
                  ? 'Project guidance in progress'
                  : 'Continue project guidance';
          found.push({
            id: `generation:${tab.id}`,
            state,
            title,
            detail: null,
            target: {
              ...onboardingGenerationTarget(workflow, tab.id),
              queryParams: { tab: tab.id, run: run.binding.runId },
            },
          });
        }
      } catch {
        // degradation-audit: optional-capability - a failed bound-run lookup does not hide independently discovered work
      }
    }
    if (
      latest?.generation &&
      latest.generation.lifecycle !== 'completed' &&
      !found.some((item) => item.id.startsWith('generation:'))
    ) {
      const tab = tabs.find(
        (candidate) => candidate.workflow === 'setup-agent-generation',
      );
      if (tab) {
        found.push({
          id: `generation:${tab.id}`,
          state: 'resumable',
          title: 'Continue agent generation',
          detail: `${latest.generation.agents.filter((agent) => agent.status === 'written').length} agents written`,
          target: {
            ...onboardingGenerationTarget('setup-agent-generation', tab.id),
            queryParams: { tab: tab.id, run: latest.generation.runId },
          },
        });
      }
    }
    if (sequence === this.refreshSequence) this._discoveredItems.set(found);
  }
}
