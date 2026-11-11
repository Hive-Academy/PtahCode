import { Injectable, inject, signal } from '@angular/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  VSCodeService,
  onboardingGenerationTarget,
  type OnboardingTarget,
} from '@ptah-extension/core';
import { WizardRpcService } from '@ptah-extension/setup-wizard';
import type { SetupGenerationWorkflow } from '@ptah-extension/shared';

export interface OnboardingResumeItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly target: OnboardingTarget;
}

/** Bounded Home discovery: the latest checkpoint pair and one tab per workflow. */
@Injectable({ providedIn: 'root' })
export class OnboardingResumeStore {
  private readonly rpc = inject(WizardRpcService);
  private readonly tabs = inject(TabManagerService);
  private readonly vscode = inject(VSCodeService);
  private readonly _items = signal<readonly OnboardingResumeItem[]>([]);
  private refreshSequence = 0;
  readonly items = this._items.asReadonly();

  clear(): void {
    this.refreshSequence++;
    this._items.set([]);
  }

  async refresh(): Promise<void> {
    const sequence = ++this.refreshSequence;
    this._items.set([]);
    const root =
      this.tabs.activeWorkspacePath || this.vscode.config().workspaceRoot;
    if (!root) {
      this._items.set([]);
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
    if (
      latest?.analysis &&
      latest.analysis.manifest.lifecycle !== 'completed'
    ) {
      found.push({
        id: 'analysis',
        title: 'Continue workspace analysis',
        detail: null,
        target: { subPath: ['analyze'], queryParams: {} },
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
          found.push({
            id: `generation:${tab.id}`,
            title:
              workflow === 'setup-agent-generation'
                ? 'Continue agent generation'
                : 'Continue project guidance',
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
          title: 'Continue agent generation',
          detail: `${latest.generation.agents.filter((agent) => agent.status === 'written').length} agents written`,
          target: {
            ...onboardingGenerationTarget('setup-agent-generation', tab.id),
            queryParams: { tab: tab.id, run: latest.generation.runId },
          },
        });
      }
    }
    if (sequence === this.refreshSequence) this._items.set(found);
  }
}
