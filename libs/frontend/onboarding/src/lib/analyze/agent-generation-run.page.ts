import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ExecutionNodeComponent } from '@ptah-extension/chat';
import { ExecutionTreeBuilderService } from '@ptah-extension/chat-streaming';
import {
  AccumulatorKeys,
  createEmptyStreamingState,
  setStreamingEventCapped,
} from '@ptah-extension/chat-types';
import {
  ONBOARDING_QUERY,
  isOnboardingIdentityValue,
} from '@ptah-extension/core';
import {
  GenerationErrorsComponent,
  GenerationSourceStatusComponent,
  GenerationStopControlComponent,
  GenerationWorkflowStore,
  sameSetupWorkspacePath,
  SetupRunStore,
  SetupWizardStateService,
  WizardRpcService,
  safeFailureCopy,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { LiveRunLayoutComponent } from '../shared/live-run-layout.component';

@Component({
  selector: 'ptah-agent-generation-run-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GenerationWorkflowStore],
  imports: [
    ExecutionNodeComponent,
    GenerationErrorsComponent,
    GenerationSourceStatusComponent,
    GenerationStopControlComponent,
    LiveRunLayoutComponent,
    PtahButtonDirective,
    RouterLink,
  ],
  template: `
    <section
      class="mx-auto flex w-full max-w-6xl flex-col gap-ptah-heading p-4 sm:p-6"
      aria-labelledby="agent-generation-title"
    >
      <h1
        id="agent-generation-title"
        tabindex="-1"
        class="text-2xl font-semibold"
      >
        Agent generation
      </h1>
      <p role="status" class="text-sm text-base-content-muted">
        {{ statusText() }}
      </p>
      @if (actionError(); as error) {
        <p role="alert">{{ error }}</p>
      }
      @if (record(); as current) {
        <ptah-live-run-layout [hasLog]="current.status === 'running'">
          @if (current.status === 'running') {
            <section
              runLog
              class="flex h-full min-h-0 flex-col rounded-lg border border-base-300 bg-base-200"
              aria-labelledby="agent-generation-log-title"
            >
              <h2
                id="agent-generation-log-title"
                class="px-3 py-2 text-sm font-medium"
              >
                Generation transcript
              </h2>
              <div
                role="log"
                aria-labelledby="agent-generation-log-title"
                tabindex="0"
                class="min-h-0 flex-1 overflow-y-auto border-t border-base-300 p-3"
              >
                @for (node of transcript().nodes; track node.id) {
                  <ptah-execution-node [node]="node" [isStreaming]="true" />
                }
                @if (transcript().text; as text) {
                  <pre class="whitespace-pre-wrap break-words text-sm">{{
                    text
                  }}</pre>
                } @else if (!transcript().nodes.length) {
                  <p class="text-sm text-base-content-muted">
                    Waiting for generation output…
                  </p>
                }
              </div>
            </section>
          }

          @if (current.status === 'running' || run()) {
            <ptah-generation-source-status
              [source]="run()?.source ?? null"
              [recorded]="!!run()"
            />
          }

          @switch (current.status) {
            @case ('running') {
              <ptah-generation-stop-control
                [active]="!cancelling()"
                (stopRequested)="stop()"
              />
            }
            @case ('failed') {
              <section
                class="flex flex-col items-start gap-ptah-heading"
                aria-labelledby="agent-generation-result-title"
              >
                <h2
                  id="agent-generation-result-title"
                  class="text-lg font-semibold"
                >
                  Generation results
                </h2>
                @if (run()?.result?.counts; as counts) {
                  <p>
                    {{ counts.written }} written ·
                    {{ counts.unchanged }} unchanged ·
                    {{ counts.failed }} failed · {{ counts.rejected }} rejected
                    · {{ counts.skipped }} skipped
                  </p>
                } @else {
                  <p>Result counts are unavailable.</p>
                }
                <ptah-generation-errors [errors]="errors()" />
                <button
                  ptahButton
                  variant="primary"
                  type="button"
                  [disabled]="busy() || failedItemIds().length === 0"
                  (click)="retryFailedItems()"
                >
                  Retry failed items
                </button>
              </section>
            }
            @case ('interrupted') {
              <p>Resume from your saved checkpoint.</p>
              <button
                ptahButton
                variant="primary"
                type="button"
                [disabled]="busy()"
                (click)="resume()"
              >
                Resume
              </button>
            }
            @case ('needs-input') {
              <section aria-labelledby="agent-preview-title">
                <h2 id="agent-preview-title" class="text-lg font-semibold">
                  Preview required
                </h2>
                <p>
                  Review and confirm the agent file changes before generation
                  can start.
                </p>
                @if (previewTarget(); as target) {
                  <a
                    ptahButton
                    [routerLink]="['/onboarding', ...target.subPath]"
                    [queryParams]="target.queryParams"
                    >Return to Review skills</a
                  >
                }
              </section>
            }
            @case ('cancelled') {
              @if (previewTarget(); as target) {
                <a
                  ptahButton
                  [routerLink]="['/onboarding', ...target.subPath]"
                  [queryParams]="target.queryParams"
                  >Return to Review skills</a
                >
              }
            }
          }
        </ptah-live-run-layout>
      } @else {
        <a ptahButton routerLink="/onboarding">Back to Setup</a>
      }
    </section>
  `,
})
export class AgentGenerationRunPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly runs = inject(SetupRunStore);
  private readonly workflow = inject(GenerationWorkflowStore);
  private readonly wizardState = inject(SetupWizardStateService);
  private readonly treeBuilder = inject(ExecutionTreeBuilderService);
  private readonly rpc = inject(WizardRpcService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly recordId = computed(() =>
    this.params().get(ONBOARDING_QUERY.tab),
  );
  protected readonly record = computed(() => {
    const id = this.recordId();
    const current = isOnboardingIdentityValue(id) ? this.runs.get(id) : null;
    return current?.workflow === 'agent-generation' &&
      sameSetupWorkspacePath(current.workspacePath, this.runs.workspacePath())
      ? current
      : null;
  });

  private readonly shownId = computed(() => this.record()?.id);
  protected readonly previewTarget = computed(() => {
    const record = this.record();
    return record?.status === 'needs-input' || record?.status === 'cancelled'
      ? this.runs.targetOf(record, 'entry')
      : null;
  });
  private readonly backendRunId = computed(() => this.record()?.backendRunId);
  private readonly status = computed(() => this.record()?.status);
  protected readonly busy = signal(false);
  protected readonly actionError = signal('');
  protected readonly cancelling = computed(() => {
    const id = this.shownId();
    return !!id && this.runs.isCancelling(id);
  });

  protected readonly statusText = computed(() => {
    switch (this.status()) {
      case 'running':
        return this.cancelling()
          ? 'Stopping agent generation…'
          : 'Generating agents…';
      case 'failed':
        return this.busy()
          ? 'Retrying failed items…'
          : 'Agent generation failed.';
      case 'interrupted':
        return 'Agent generation was interrupted.';
      case 'needs-input':
        return 'Agent generation is waiting for your confirmation.';
      case 'completed':
        return 'Agent generation complete.';
      case 'cancelled':
        return 'Agent generation stopped.';
      default:
        return 'This agent generation run is unavailable in the current workspace.';
    }
  });

  protected readonly run = computed(() => {
    const run = this.workflow.run();
    const record = this.record();
    return run &&
      record &&
      run.binding.tabId === record.id &&
      sameSetupWorkspacePath(run.binding.workspacePath, record.workspacePath) &&
      run.binding.runId === record.backendRunId
      ? run
      : null;
  });

  private readonly failedOutcomes = computed(() =>
    (this.run()?.result?.agentOutcomes ?? []).filter(
      (item) => item.status === 'failed' || item.status === 'rejected',
    ),
  );
  protected readonly failedItemIds = computed(() =>
    this.failedOutcomes().map((item) => item.agentId),
  );
  protected readonly errors = computed(() =>
    this.failedOutcomes().map(
      (item) =>
        `${item.agentId}: ${safeFailureCopy(item.error, 'Generation failed for this item.')}`,
    ),
  );
  protected readonly transcript = computed(() => {
    const record = this.record();
    const runId = record?.backendRunId;
    if (!record || !runId) return { nodes: [], text: '' };
    const state = createEmptyStreamingState();
    const text: string[] = [];
    for (const event of this.wizardState.generationStream()) {
      const source = event.tabBinding;
      if (
        source?.tabId !== record.id ||
        !sameSetupWorkspacePath(source.workspacePath, record.workspacePath) ||
        source.workflow !== 'setup-agent-generation' ||
        source.runId !== runId
      )
        continue;
      const flat = event.flatEvent;
      if (!flat) {
        text.push(
          event.toolName
            ? `\n${event.toolName}: ${event.content}\n`
            : event.content,
        );
        continue;
      }
      setStreamingEventCapped(state, flat);
      if (
        flat.eventType === 'text_delta' ||
        flat.eventType === 'thinking_delta'
      ) {
        const key =
          flat.eventType === 'text_delta'
            ? AccumulatorKeys.textBlock(flat.messageId, flat.blockIndex ?? 0)
            : AccumulatorKeys.thinkingBlock(
                flat.messageId,
                flat.blockIndex ?? 0,
              );
        state.textAccumulators.set(
          key,
          (state.textAccumulators.get(key) ?? '') + flat.delta,
        );
      }
    }
    return {
      nodes: state.events.size ? this.treeBuilder.buildTree(state, runId) : [],
      text: text.join(''),
    };
  });

  public constructor() {
    effect((onCleanup) => {
      const id = this.shownId();
      this.actionError.set('');
      if (!id) return;
      untracked(() => this.runs.attach(id));
      onCleanup(() => this.runs.release(id));
    });

    effect((onCleanup) => {
      const id = this.shownId();
      const runId = this.backendRunId();
      const status = this.status();
      if (!id || !runId || status === 'needs-input') return;
      const current = untracked(this.record);
      const binding = current && this.runs.bindingFor(current);
      if (!binding) return;
      untracked(() => this.workflow.bind(binding, runId));
      onCleanup(() => this.workflow.unbind());
    });

    effect(() => {
      if (this.status() !== 'completed') return;
      this.shownId();
      const record = untracked(this.record);
      if (record)
        untracked(
          () => void this.openRun(record, 'Could not open the Setup summary.'),
        );
    });
  }

  protected async stop(): Promise<void> {
    const id = this.shownId();
    if (!id) return;
    this.actionError.set('');
    if (
      !(await this.runs.cancel(id)) &&
      this.shownId() === id &&
      this.status() === 'running'
    ) {
      this.actionError.set('Could not confirm that generation stopped.');
    }
  }

  protected async resume(): Promise<void> {
    const id = this.shownId();
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      // The store uses the bound resume request so the checkpoint stays with this record.
      const resumed = await this.runs.retry(id);
      if (this.destroyRef.destroyed || this.shownId() !== id) return;
      if (resumed && resumed.id !== id)
        await this.openRun(
          resumed,
          'Could not open the active generation run.',
        );
      else if (
        resumed?.status === 'interrupted' ||
        (resumed?.status === 'failed' && resumed.error)
      ) {
        this.actionError.set(
          resumed.error ?? 'Could not resume agent generation.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async retryFailedItems(): Promise<void> {
    const record = this.record();
    const itemIds = this.failedItemIds();
    const binding = this.run()?.binding;
    if (
      record?.status !== 'failed' ||
      !binding ||
      !itemIds.length ||
      this.busy()
    )
      return;
    this.busy.set(true);
    this.actionError.set('');
    try {
      // The host owns one generation slot. Each item RPC waits for that item to settle.
      let retryFailed = false;
      for (const itemId of itemIds) {
        try {
          await this.rpc.retryGenerationItem(itemId, binding);
        } catch {
          // degradation-audit: reported - show a retry error unless the checkpoint confirms completion.
          retryFailed = true;
        }
      }
      const result = await this.rpc.getBoundRunState(binding, binding.runId);
      const current = this.runs.get(record.id);
      if (
        current?.status === 'failed' &&
        current.backendRunId === binding.runId &&
        result?.status === 'completed' &&
        !result.interrupted &&
        result.binding.tabId === binding.tabId &&
        result.binding.workflow === binding.workflow &&
        sameSetupWorkspacePath(
          result.binding.workspacePath,
          binding.workspacePath,
        ) &&
        result.binding.runId === binding.runId
      ) {
        // Intermediate item results can still be failed. Reopen the record only once the whole checkpoint is complete.
        this.runs.report(record.id, { status: 'running' });
        this.runs.reportRun(record.id, result);
      } else if (!this.destroyRef.destroyed && this.shownId() === record.id) {
        this.workflow.unbind();
        this.workflow.bind(binding, binding.runId);
        if (retryFailed)
          this.actionError.set('Some items could not be retried.');
      }
    } catch {
      // degradation-audit: reported - keep the failed state and explain why retry could not be confirmed.
      if (!this.destroyRef.destroyed && this.shownId() === record.id) {
        this.actionError.set('Could not confirm the retry results.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async openRun(
    record: SetupRunRecord,
    failure: string,
  ): Promise<void> {
    const { subPath, queryParams } = this.runs.targetOf(record);
    try {
      if (
        await this.router.navigate(['/onboarding', ...subPath], {
          queryParams,
          replaceUrl: true,
        })
      )
        return;
    } catch {
      // degradation-audit: reported - the page keeps the result and shows a navigation error.
    }
    if (!this.destroyRef.destroyed) this.actionError.set(failure);
  }
}
