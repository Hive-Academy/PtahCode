import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, map, skip } from 'rxjs';
import { ExecutionNodeComponent } from '@ptah-extension/chat';
import { ExecutionTreeBuilderService } from '@ptah-extension/chat-streaming';
import {
  AccumulatorKeys,
  createEmptyStreamingState,
  setStreamingEventCapped,
} from '@ptah-extension/chat-types';
import { isOnboardingIdentityValue } from '@ptah-extension/core';
import type {
  EnhancedGenerationStreamPayload,
  EnhancedPromptsDetectedStack,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import {
  GenerationHandoffStore,
  GenerationWorkflowStore,
  GuidanceGenerationStore,
  GuidanceResultPanelComponent,
  sameSetupWorkspacePath,
  SetupRunStore,
  SetupWizardStateService,
  WizardRpcService,
  isTerminalSetupRunStatus,
  safeFailureCopy,
  stepTarget,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';
import { LiveRunLayoutComponent } from '../shared/live-run-layout.component';
import {
  OnboardingStepperComponent,
  type OnboardingStep,
} from '../shared/onboarding-stepper.component';
import {
  RecoveryScreenComponent,
  type OnboardingRecoveryReason,
} from '../shared/recovery-screen.component';
import { RunPanelComponent } from '../shared/run-panel.component';
import { chipStateFor } from '../shared/run-status-chip.component';
import { onboardingStepLink } from '../shell/onboarding-step-link';
import { GenerationStepStore } from './generation-step.store';
import { PtahButtonDirective } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-project-guidance-page',
  standalone: true,
  imports: [
    ExecutionNodeComponent,
    LiveRunLayoutComponent,
    GuidanceResultPanelComponent,
    OnboardingStepperComponent,
    RecoveryScreenComponent,
    RunPanelComponent,
    PtahButtonDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: [
    `
      :host
        ::ng-deep
        [data-testid='guidance-saved-card']
        > ptah-guidance-result-panel
        > section {
        border: 0;
        background: transparent;
        padding: 0;
      }
    `,
  ],
  template: `
    <section
      class="mx-auto space-y-5"
      [class.max-w-[1120px]]="
        binding() &&
        !recovery() &&
        !workflow.runMismatch() &&
        !workflow.lookupExhausted() &&
        !lookupError()
      "
      [class.max-w-[760px]]="
        !binding() ||
        recovery() ||
        workflow.runMismatch() ||
        workflow.lookupExhausted() ||
        lookupError()
      "
      [class.p-4]="
        !binding() ||
        recovery() ||
        workflow.runMismatch() ||
        workflow.lookupExhausted() ||
        lookupError()
      "
      aria-labelledby="project-guidance-title"
      data-testid="project-guidance-page"
    >
      <header>
        <h1
          id="project-guidance-title"
          tabindex="-1"
          class="text-2xl font-semibold"
        >
          Project guidance
        </h1>
        <p class="text-sm text-base-content-muted">
          Build guidance for this workspace and choose when to use it.
        </p>
      </header>
      <ptah-onboarding-stepper [steps]="steps()" />
      @if (recovery() || workflow.runMismatch()) {
        <div data-testid="guidance-recovery-panel">
          <ptah-recovery-screen
            [reason]="workflow.runMismatch() ? 'stale-run' : recovery()!"
            (primary)="openLatest()"
          />
        </div>
      } @else if (workflow.lookupExhausted()) {
        <section
          class="rounded-[22px] border border-state-err/70 p-5"
          role="alert"
          data-testid="guidance-lookup-exhausted"
        >
          <h2 class="font-semibold">Run state is unavailable</h2>
          <p>We could not confirm this run. Try the lookup again.</p>
          <button
            ptahButton
            variant="primary"
            type="button"
            class="mt-3"
            (click)="refresh()"
          >
            Retry
          </button>
        </section>
      } @else if (lookupError()) {
        <section
          class="rounded-[22px] border border-state-err/70 p-5"
          role="alert"
          data-testid="guidance-lookup-error"
        >
          <h2 class="font-semibold">Run state is unavailable</h2>
          <p>We could not check the current guidance run.</p>
          <button
            ptahButton
            variant="primary"
            type="button"
            class="mt-3"
            (click)="retryLookup()"
          >
            Retry
          </button>
        </section>
      } @else {
        <ptah-live-run-layout [hasLog]="!!binding()">
          @if (binding()) {
            <section
              runLog
              class="flex h-full min-h-0 flex-col rounded-lg border border-base-300 bg-base-200"
              aria-labelledby="guidance-log-title"
            >
              <h2 id="guidance-log-title" class="px-3 py-2 text-sm font-medium">
                Details log
              </h2>
              <div
                role="log"
                aria-labelledby="guidance-log-title"
                tabindex="0"
                class="min-h-0 flex-1 overflow-y-auto border-t border-base-300 p-3"
              >
                @for (node of transcript().nodes; track node.id) {
                  <ptah-execution-node
                    [node]="node"
                    [isStreaming]="panelState() === 'running'"
                  />
                }
                @if (transcript().text; as text) {
                  <pre class="whitespace-pre-wrap break-words text-sm">{{
                    text
                  }}</pre>
                } @else if (!transcript().nodes.length) {
                  <p class="text-sm text-base-content-muted">No output yet.</p>
                }
              </div>
            </section>
          }
          <div
            data-testid="guidance-state-chip"
            [attr.data-state]="interrupted() ? 'interrupted' : workflow.state()"
          >
            <ptah-run-panel
              [state]="panelState()"
              [viewState]="workflow.state()"
              [title]="runTitle()"
              [message]="runMessage()"
              continueLabel="Continue"
              (stop)="stop()"
              (retry)="retry()"
              (startOver)="retry()"
              (continueRun)="continueDone()"
              (resumeRequested)="retry()"
            >
              @if (workflow.state() === 'starting') {
                <button
                  ptahButton
                  type="button"
                  class="mt-3"
                  (click)="stop()"
                >
                  Stop
                </button>
              }
              @if (interrupted()) {
                <button
                  ptahButton
                  variant="primary"
                  type="button"
                  (click)="retry()"
                >
                  Retry
                </button>
              } @else if (
                !boundRunId() &&
                workflow.state() === 'idle' &&
                !lookupPending() &&
                !handoff.inFlight() &&
                !handoff.pending()
              ) {
                <button
                  ptahButton
                  variant="primary"
                  type="button"
                  class="mt-3"
                  data-testid="guidance-start"
                  (click)="start()"
                >
                  Start guidance
                </button>
              }
            </ptah-run-panel>
          </div>
          @if (workflow.rejection()?.reason === 'blocked') {
            <section
              class="flex flex-col gap-3 rounded-[14px] border border-state-err/70 p-4 text-sm sm:flex-row sm:items-center"
              role="status"
              data-testid="guidance-owner-conflict"
            >
              <p class="min-w-0 flex-1 text-state-need">
                <strong>Another run is active.</strong> Open the active run
                before starting another.
              </p>
              <div class="flex flex-wrap gap-2">
                <button ptahButton type="button" (click)="openOwner()">
                  Open it
                </button>
                <button ptahButton type="button" (click)="refresh()">
                  Check again
                </button>
              </div>
            </section>
          }
          @if (detectedStack(); as stack) {
            <section
              class="rounded-[22px] border border-base-300 p-5"
              data-glass-surface="content"
              data-testid="guidance-detected-stack"
            >
              <h2 class="font-semibold">Detected stack</h2>
              <p class="text-sm">{{ stack.projectType }}</p>
              @if (stack.languages.length) {
                <p class="text-sm">
                  Languages: {{ stack.languages.join(', ') }}
                </p>
              }
              @if (stack.frameworks.length) {
                <p class="text-sm">
                  Frameworks: {{ stack.frameworks.join(', ') }}
                </p>
              }
              @if (stack.buildTools.length) {
                <p class="text-sm">
                  Build tools: {{ stack.buildTools.join(', ') }}
                </p>
              }
              @if (stack.testingFrameworks.length) {
                <p class="text-sm">
                  Testing: {{ stack.testingFrameworks.join(', ') }}
                </p>
              }
            </section>
          }
          @if (sections(); as summary) {
            <section
              class="rounded-[22px] border border-base-300 p-5"
              data-glass-surface="content"
              data-testid="guidance-summary-card"
            >
              <h2 class="font-semibold">Generated guidance</h2>
              <ul class="mt-3 space-y-2">
                @for (section of summary.sections; track section.name) {
                  <li
                    class="flex justify-between gap-3 rounded-[10px] border border-base-300 p-3 text-sm"
                    data-testid="guidance-summary-row"
                  >
                    <span>{{ section.name }}</span
                    ><span>{{ section.wordCount }} words</span>
                  </li>
                }
              </ul>
              <p class="mt-3 text-sm">
                {{ generatedCount() }} of 4 sections generated
              </p>
            </section>
          }
          @if (
            guidance.run()?.committedState === 'unchanged' &&
            workflow.state() === 'completed'
          ) {
            <p role="status" data-testid="guidance-unchanged">
              Saved guidance was already current; nothing needed changing.
            </p>
          }
          @if (binding()) {
            <section
              class="rounded-[22px] border border-base-300 p-5"
              data-glass-surface="content"
              data-testid="guidance-saved-card"
            >
              <ptah-guidance-result-panel
                [result]="guidance.result()"
                [runActive]="workflow.isBound()"
                [showSkip]="true"
                (enabledChanged)="setEnabled($event)"
                (cacheRequested)="refreshSaved()"
                (contentRequested)="loadContent()"
                (downloadRequested)="download()"
                (regenerateRequested)="retry()"
                (skipRequested)="skip()"
              />
            </section>
          }
          @if (guidance.content(); as content) {
            <section
              class="rounded-[22px] border border-base-300 p-5"
              data-testid="guidance-content"
            >
              <h2 class="font-semibold">Saved guidance content</h2>
              <pre class="whitespace-pre-wrap break-words text-sm">{{
                content
              }}</pre>
            </section>
          }
          @if (guidance.actionFailed()) {
            <p role="alert">
              The guidance action could not be completed. Try again.
            </p>
          }
          @if (!standalone()) {
            <button
              ptahButton
              variant="ghost"
              type="button"
              class="mt-3"
              data-testid="guidance-skip"
              (click)="skip()"
            >
              Skip to Done
            </button>
          }
        </ptah-live-run-layout>
      }
    </section>
  `,
})
export class ProjectGuidancePage implements OnInit {
  protected readonly workflow = inject(GenerationWorkflowStore);
  protected readonly guidance = inject(GuidanceGenerationStore);
  protected readonly handoff = inject(GenerationHandoffStore);
  private readonly step = inject(GenerationStepStore);
  private readonly rpc = inject(WizardRpcService);
  private readonly runs = inject(SetupRunStore);
  private readonly wizardState = inject(SetupWizardStateService);
  private readonly treeBuilder = inject(ExecutionTreeBuilderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;
  private autoStartedParent: string | null = null;
  protected readonly boundRunId = signal<string | null>(null);
  protected readonly binding = signal<SetupGenerationTabBinding | null>(null);
  protected readonly recovery = signal<OnboardingRecoveryReason | null>(null);
  protected readonly lookupError = signal(false);
  protected readonly lookupPending = signal(true);
  protected readonly detectedStack =
    signal<EnhancedPromptsDetectedStack | null>(null);
  protected readonly standalone = computed(
    () => this.route.snapshot.data['standalone'] === true,
  );
  protected readonly interrupted = computed(() => {
    const binding = this.binding();
    return (
      !!binding &&
      !this.workflow.isBound() &&
      this.runs.get(binding.tabId)?.status === 'interrupted'
    );
  });
  protected readonly transcript = computed(() => {
    const binding = this.binding();
    const record = binding && this.runs.get(binding.tabId);
    const activeRun = this.workflow.run()?.binding;
    const runId =
      record?.backendRunId ??
      (activeRun?.tabId === record?.id ? activeRun?.runId : undefined);
    if (!record || !runId) return { nodes: [], text: '' };

    const state = createEmptyStreamingState();
    const text: string[] = [];
    for (const event of this.wizardState.enhanceStream() as readonly EnhancedGenerationStreamPayload[]) {
      const source = event.tabBinding;
      if (
        source?.tabId !== record.id ||
        !sameSetupWorkspacePath(source.workspacePath, record.workspacePath) ||
        source.workflow !== 'setup-project-prompt' ||
        source.runId !== runId
      )
        continue;
      const flat = event.flatEvent;
      if (flat) {
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
      } else if (event.toolName)
        text.push(`\n${event.toolName}: ${event.content}\n`);
      else text.push(event.content);
    }
    return {
      nodes: state.events.size ? this.treeBuilder.buildTree(state, runId) : [],
      text: text.join(''),
    };
  });
  protected readonly panelState = computed(() =>
    this.interrupted()
      ? 'idle'
      : this.workflow.state() === 'cancelled'
        ? 'failed'
        : chipStateFor(this.workflow.state()),
  );
  protected readonly runTitle = computed(() =>
    this.interrupted()
      ? 'Guidance interrupted'
      : {
          idle: 'Ready to create guidance',
          starting: 'Starting guidance',
          running: 'Creating guidance',
          quiet: 'Checking run state',
          cancelling: 'Stopping guidance',
          'stop-unconfirmed': 'Checking stop',
          'stop-unknown': 'Checking run state',
          completed: 'Guidance ready',
          cancelled: 'Guidance stopped',
          failed: 'Guidance failed',
          'timed-out': 'Guidance timed out',
        }[this.workflow.state()],
  );
  protected readonly runMessage = computed(() => {
    if (this.interrupted()) return 'Guidance was interrupted. Retry the run.';
    const state = this.workflow.state();
    const reason = this.workflow.startError();
    if (state === 'failed')
      return safeFailureCopy(
        reason,
        'Guidance failed. Retry the run or start over.',
      );
    if (state === 'timed-out')
      return safeFailureCopy(
        reason ?? 'timed out',
        'Guidance timed out. Retry the run.',
      );
    if (state === 'cancelled') return 'Guidance stopped. You can try again.';
    if (
      state === 'cancelling' ||
      state === 'stop-unconfirmed' ||
      state === 'stop-unknown'
    )
      return 'Stopping guidance. Check its status before starting another run.';
    if (reason)
      return safeFailureCopy(reason, 'Guidance could not start. Try again.');
    if (state === 'idle') return 'Start when you are ready.';
    return state === 'completed'
      ? 'Your saved guidance is ready to use.'
      : '';
  });
  protected readonly sections = computed(() => {
    const binding = this.binding();
    const run = this.guidance.run();
    const saved = this.guidance.result();
    if (
      !binding ||
      !run ||
      this.workflow.state() !== 'completed' ||
      run.status !== 'completed' ||
      (run.committedState ?? run.result?.committedState) !== 'committed' ||
      !saved?.enabled ||
      !this.workflow.run() ||
      this.workflow.run()?.binding.runId !== run.binding.runId
    )
      return null;
    return this.step.guidanceSections(
      binding.workspacePath,
      run.binding.runId,
      saved.generatedAt,
    );
  });
  protected readonly generatedCount = computed(
    () =>
      this.sections()?.sections.filter((section) => section.generated).length ??
      0,
  );
  protected readonly steps = computed<readonly OnboardingStep[]>(() =>
    this.standalone()
      ? [
          { id: 'guidance', label: 'Project guidance', state: 'current' },
          { id: 'done', label: 'Done', state: 'upcoming' },
        ]
      : [
          { id: 'analyze', label: 'Analyze', state: 'completed' },
          { id: 'skills', label: 'Review skills', state: 'completed' },

          { id: 'guidance', label: 'Project guidance', state: 'current' },
          { id: 'done', label: 'Done', state: 'upcoming' },
        ],
  );

  constructor() {
    let workspace = this.runs.workspacePath();
    effect(() => {
      const current = this.runs.workspacePath();
      if (current === workspace) return;
      workspace = current;
      untracked(
        () => void this.openRoute(this.route.snapshot.queryParamMap.get('tab')),
      );
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      const binding = this.binding();
      if (binding) this.runs.release(binding.tabId);
    });
    effect(() => {
      const run = this.workflow.run();
      if (run && run.binding.tabId === this.binding()?.tabId)
        this.guidance.adopt(run);
    });
    effect(() => {
      const started = this.handoff.started();
      if (
        !started ||
        this.lookupPending() ||
        this.boundRunId() ||
        this.recovery() ||
        !sameSetupWorkspacePath(
          started.workspacePath,
          this.runs.workspacePath(),
        )
      )
        return;
      const binding = this.binding();
      if (binding) {
        if (started.tabId === binding.tabId)
          untracked(() => void this.bindRunSequence(binding, null));
        return;
      }
      const record = this.runs.get(started.tabId);
      const parent = this.agentRecord(null);
      if (record && parent && record.parentId === parent.id)
        untracked(() => void this.openRecord(record));
    });
  }

  async ngOnInit(): Promise<void> {
    this.route.queryParamMap
      .pipe(
        map((params) => params.get('tab')),
        distinctUntilChanged(),
        skip(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((id) => {
        if (id !== this.binding()?.tabId) void this.openRoute(id);
      });
    await this.openRoute(this.route.snapshot.queryParamMap.get('tab'));
  }

  private async openRoute(recordId: string | null): Promise<void> {
    this.setBinding(null);
    this.workflow.unbind();
    this.guidance.unbind();
    this.detectedStack.set(null);
    this.lookupPending.set(false);
    this.lookupError.set(false);
    this.boundRunId.set(null);
    this.recovery.set(null);
    const workspacePath = this.runs.workspacePath();
    if (!workspacePath) {
      this.recovery.set('workspace-mismatch');
      return;
    }
    const record = recordId ? this.runs.get(recordId) : this.latestGuidance();
    if (recordId && !record) {
      this.recovery.set('missing-tab');
      return;
    }
    if (record) {
      await this.openRecord(
        record,
        this.route.snapshot.queryParamMap.get('run'),
      );
    } else {
      await this.startPendingHandoff(null);
    }
  }

  private async openRecord(
    record: SetupRunRecord,
    runId: string | null = null,
  ): Promise<void> {
    if (record.workflow !== 'project-guidance') {
      this.recovery.set('foreign-tab');
      return;
    }
    if (!sameSetupWorkspacePath(record.workspacePath, this.runs.workspacePath())) {
      this.recovery.set('workspace-mismatch');
      return;
    }
    const binding = this.runs.bindingFor(record);
    if (!binding) return;
    this.recovery.set(null);
    this.setBinding(binding);
    await this.bindRunSequence(binding, runId);
  }

  private setBinding(binding: SetupGenerationTabBinding | null): void {
    const previous = this.binding();
    if (previous?.tabId !== binding?.tabId) {
      if (previous) this.runs.release(previous.tabId);
      if (binding) this.runs.attach(binding.tabId);
    }
    this.binding.set(binding);
  }

  private latestGuidance(): SetupRunRecord | null {
    const parent = this.agentRecord(null);
    const analysis = this.route.snapshot.queryParamMap.get('analysis');
    const records = this.runs
      .runs()
      .filter((record) => record.workflow === 'project-guidance');
    return (
      records.find((record) => !isTerminalSetupRunStatus(record.status)) ??
      records.find((record) =>
        parent
          ? record.parentId === parent.id
          : analysis
            ? record.analysisRunId === analysis && record.parentId !== null
            : record.parentId === null,
      ) ??
      (this.standalone() ? records[0] : undefined) ??
      null
    );
  }

  private agentRecord(guidance: SetupRunRecord | null): SetupRunRecord | null {
    if (this.standalone()) return null;
    const id =
      guidance?.parentId ?? this.route.snapshot.queryParamMap.get('gen');
    const record = id ? this.runs.get(id) : null;
    return record?.workflow === 'agent-generation' &&
      sameSetupWorkspacePath(record.workspacePath, this.runs.workspacePath())
      ? record
      : null;
  }

  private async bindRunSequence(
    binding: SetupGenerationTabBinding,
    requestedRunId: string | null,
  ): Promise<void> {
    this.lookupPending.set(true);
    this.lookupError.set(false);
    const record = this.runs.get(binding.tabId);
    // An interrupted record can outlive the backend attempt it refers to.
    const interrupted = record?.status === 'interrupted';
    let runId = requestedRunId;
    const started = this.handoff.started();
    if (
      !runId &&
      started?.tabId === binding.tabId &&
      sameSetupWorkspacePath(started.workspacePath, binding.workspacePath)
    )
      runId = started.runId;
    runId ??= record?.backendRunId ?? null;
    if (!runId && !interrupted) {
      try {
        runId =
          (await this.rpc.getBoundRunState(binding))?.binding.runId ?? null;
      } catch {
        // degradation-audit: reported — lookupError shows that the run lookup failed.
        if (this.hasWorkspaceBinding(binding)) {
          this.lookupError.set(true);
          this.lookupPending.set(false);
        }
        return;
      }
      if (!this.hasWorkspaceBinding(binding)) return;
      const late = this.handoff.started();
      if (
        late?.tabId === binding.tabId &&
        sameSetupWorkspacePath(late.workspacePath, binding.workspacePath)
      )
        runId = late.runId;
    }
    const result = this.step.bindGuidance(
      binding,
      interrupted ? undefined : (runId ?? undefined),
    );
    if (result !== 'bound') {
      this.recovery.set(
        result === 'workspace-mismatch' ? 'workspace-mismatch' : 'foreign-tab',
      );
      this.lookupPending.set(false);
      return;
    }
    this.boundRunId.set(runId);
    this.lookupPending.set(false);
    await this.workflow.refresh();
    if (!this.hasWorkspaceBinding(binding)) return;
    await this.guidance.refreshCommitted();
    if (!this.hasWorkspaceBinding(binding)) return;
    await this.refreshStatus();
    if (!this.hasWorkspaceBinding(binding)) return;
    if (runId && !requestedRunId) {
      await this.replaceIdentity(binding, runId);
      if (!this.hasWorkspaceBinding(binding)) return;
    }
    if (!runId && !interrupted) await this.startPendingHandoff(record);
  }

  private async startPendingHandoff(
    record: SetupRunRecord | null,
  ): Promise<void> {
    const agent = this.agentRecord(record);
    // An idle handoff can already be inside manualContinue: only a pending
    // countdown is proof that this page may start it.
    const pending = this.handoff.pending();
    if (
      agent &&
      pending?.agentRunId === agent.id &&
      this.handoff.outcome() !== 'manual-recovery' &&
      this.autoStartedParent !== agent.id
    ) {
      this.autoStartedParent = agent.id;
      await this.handoff.startNow();
    }
  }

  protected stop(): void {
    if (this.hasWorkspaceBinding()) this.workflow.stop();
  }

  protected async retryLookup(): Promise<void> {
    const binding = this.binding();
    if (!binding || !this.hasWorkspaceBinding(binding)) return;
    await this.bindRunSequence(
      binding,
      this.route.snapshot.queryParamMap.get('run'),
    );
  }
  private async refreshStatus(): Promise<void> {
    const binding = this.binding();
    if (!binding || !this.hasWorkspaceBinding(binding)) return;
    try {
      const status = await this.rpc.getEnhancedPromptsStatus(
        binding.workspacePath,
      );
      if (this.hasWorkspaceBinding(binding) && !status.error)
        this.detectedStack.set(status.detectedStack);
    } catch {
      // degradation-audit: reported — the saved result panel presents status failures.
    }
  }
  protected async refresh(): Promise<void> {
    const binding = this.binding();
    if (!this.hasWorkspaceBinding(binding)) return;
    await this.workflow.refresh();
    if (!this.hasWorkspaceBinding(binding)) return;
    await this.guidance.refresh();
    if (!this.hasWorkspaceBinding(binding)) return;
    await this.refreshStatus();
  }
  protected async openLatest(): Promise<void> {
    const binding = this.binding();
    if (!binding) {
      const record = this.latestGuidance();
      if (record) await this.openRecord(record);
      else await this.router.navigate(['/onboarding']);
      if (this.destroyed) return;
      return;
    }
    if (!this.hasWorkspaceBinding(binding)) return;
    this.workflow.bind(binding);
    await this.refresh();
    if (!this.hasWorkspaceBinding(binding)) return;
    const run = this.workflow.run();
    if (run) {
      await this.router.navigate([], {
        queryParams: {
          ...this.route.snapshot.queryParams,
          run: run.binding.runId,
        },
        replaceUrl: true,
      });
      if (this.destroyed) return;
    }
  }
  protected async start(): Promise<void> {
    const started = this.handoff.started();
    let binding = this.binding();
    if (
      this.lookupError() ||
      this.lookupPending() ||
      this.handoff.inFlight() ||
      this.handoff.pending() ||
      this.boundRunId() ||
      (binding &&
        started?.tabId === binding.tabId &&
        sameSetupWorkspacePath(started.workspacePath, binding.workspacePath))
    )
      return;
    if (!binding) {
      const analysis = this.route.snapshot.queryParamMap.get('analysis');
      const parent =
        this.agentRecord(null) ??
        (!this.standalone() && analysis
          ? this.runs
              .runs()
              .find(
                (record) =>
                  record.workflow === 'skill-review' &&
                  record.analysisRunId === analysis,
              )
          : undefined);
      const record = this.runs.start(
        'project-guidance',
        this.runs.workspacePath(),
        {
          parentId: parent?.id,
          analysisRunId:
            parent?.analysisRunId ??
            (isOnboardingIdentityValue(analysis) ? analysis : null),
          origin: this.standalone()
            ? 'independent-start'
            : 'analysis-result-continue',
        },
      );
      if (!record) {
        this.recovery.set('workspace-mismatch');
        return;
      }
      await this.openRecord(record);
      if (
        this.destroyed ||
        !sameSetupWorkspacePath(this.runs.workspacePath(), record.workspacePath)
      )
        return;
      binding = this.binding();
      if (
        !binding ||
        this.recovery() ||
        this.lookupError() ||
        this.boundRunId()
      )
        return;
    }
    if (!this.hasWorkspaceBinding(binding)) return;
    await this.workflow.startGuidance();
    if (this.destroyed) return;
    await this.followWorkflowBinding();
  }
  protected async retry(): Promise<void> {
    if (!this.hasWorkspaceBinding()) return;
    await this.workflow.regenerateGuidance();
    if (this.destroyed) return;
    await this.followWorkflowBinding();
  }
  private async followWorkflowBinding(): Promise<void> {
    const binding = this.workflow.binding();
    if (
      !binding ||
      !sameSetupWorkspacePath(binding.workspacePath, this.runs.workspacePath())
    )
      return;
    this.setBinding(binding);
    this.guidance.bind(binding);
    await this.refresh();
    if (!this.hasWorkspaceBinding(binding)) return;
    const runId =
      this.runs.get(binding.tabId)?.backendRunId ??
      this.workflow.run()?.binding.runId ??
      null;
    this.boundRunId.set(runId);
    await this.replaceIdentity(binding, runId);
  }
  private async replaceIdentity(
    binding: SetupGenerationTabBinding,
    runId: string | null,
  ): Promise<void> {
    await this.router.navigate([], {
      queryParams: {
        ...this.route.snapshot.queryParams,
        tab: binding.tabId,
        run: runId,
      },
      replaceUrl: true,
    });
  }
  private hasWorkspaceBinding(binding = this.binding()): boolean {
    return (
      !this.destroyed &&
      binding !== null &&
      this.binding() === binding &&
      sameSetupWorkspacePath(binding.workspacePath, this.runs.workspacePath())
    );
  }

  protected async setEnabled(value: boolean): Promise<void> {
    if (!this.hasWorkspaceBinding()) return;
    await this.guidance.setEnabled(value);
    if (this.destroyed) return;
    await this.refreshStatus();
    if (this.destroyed) return;
  }
  protected async refreshSaved(): Promise<void> {
    if (!this.hasWorkspaceBinding()) return;
    await this.guidance.refreshCommitted();
    if (this.destroyed) return;
    await this.refreshStatus();
    if (this.destroyed) return;
  }
  protected async loadContent(): Promise<void> {
    if (!this.hasWorkspaceBinding()) return;
    await this.guidance.loadContent();
    if (this.destroyed) return;
  }
  protected async download(): Promise<void> {
    if (!this.hasWorkspaceBinding()) return;
    await this.guidance.download();
    if (this.destroyed) return;
  }
  protected async openOwner(): Promise<void> {
    const rejection = this.workflow.rejection();
    const ownerId =
      rejection?.reason === 'blocked' ? rejection.ownerTabId : null;
    const owner = ownerId ? this.runs.get(ownerId) : null;
    if (
      owner?.workflow !== 'project-guidance' ||
      !sameSetupWorkspacePath(owner.workspacePath, this.runs.workspacePath())
    )
      return;
    const target = stepTarget(owner);
    const navigated = await this.router.navigate(
      ['/onboarding', ...target.subPath],
      {
        queryParams: target.queryParams,
      },
    );
    if (!this.destroyed && navigated && this.binding()?.tabId !== owner.id)
      await this.openRecord(owner);
  }
  protected async skip(): Promise<void> {
    await this.navigateDone();
    if (this.destroyed) return;
  }
  protected async continueDone(): Promise<void> {
    await this.navigateDone();
    if (this.destroyed) return;
  }
  private async navigateDone(): Promise<void> {
    if (this.standalone()) {
      await this.router.navigate(['/onboarding']);
      if (this.destroyed) return;
      return;
    }
    const link = onboardingStepLink(
      'guidance',
      'done',
      this.route.snapshot.queryParams,
    );
    await this.router.navigate(link.commands, {
      queryParams: link.queryParams,
    });
    if (this.destroyed) return;
  }
}
