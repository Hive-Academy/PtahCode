import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  untracked,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  AlertCircle,
  Bot,
  Info,
  LucideAngularModule,
  PanelRightOpen,
  Sparkles,
} from 'lucide-angular';
import {
  ClaudeRpcService,
  EffortStateService,
  WorkspaceScopeService,
} from '@ptah-extension/core';
import {
  NativePopoverComponent,
  PtahButtonDirective,
  PtahToggleDirective,
  PtahIconButtonDirective,
  PtahFormSectionComponent,
  PtahSettingRowComponent,
  PtahStatusComponent,
  PtahAlertComponent,
  PtahRichSelectComponent,
  PtahSelectIconDirective,
} from '@ptah-extension/ui';
import type {
  EffortLevel,
  EnhancedPromptsGetStatusResponse,
} from '@ptah-extension/shared';
import { AdvancedOverviewStore } from '../advanced/advanced-overview.store';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { UltracodeStateService } from '../../services/ultracode-state.service';
import { SystemPromptDrawerComponent } from './system-prompt-drawer.component';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';

interface EffortChoice {
  /** `''` is the SDK default (no stored effort). */
  readonly value: EffortLevel | '';
  readonly label: string;
}

const EFFORT_CHOICES: readonly EffortChoice[] = [
  { value: '', label: 'Default' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'X-High' },
  { value: 'max', label: 'Max' },
];

type WriteResult = { ok: true } | { ok: false; message: string };

const PROMPT_STATUS_LOAD_FAILED = 'Could not load the system prompt status.';
const PROMPT_MODE_SAVE_FAILED = 'Could not save the system prompt mode.';
const WORKFLOWS_LOAD_FAILED = 'Could not load the dynamic workflows setting.';
const WORKFLOWS_SAVE_FAILED = 'Could not save the dynamic workflows setting.';
const EFFORT_SAVE_FAILED = 'Could not save the chat reasoning effort.';
const EFFORT_PINNED = 'Turn Ultracode off to change the chat reasoning effort.';
const ULTRACODE_ON_FAILED =
  'Could not turn on Ultracode: the reasoning effort was not saved.';
const ULTRACODE_OFF_FAILED =
  'Could not turn off Ultracode: your previous reasoning effort was not restored.';

/** Each row description is the row hint. It wraps, and its id stays `agent-behaviour-<row>-note`. */
const PROMPT_NOTE_ON =
  "Ptah's project-specific prompt, used for all sessions when on.";
const PROMPT_NOTE_WIZARD =
  'Run Setup to analyze your project, review skills, and prepare project guidance.';
const PROMPT_NOTE_UNKNOWN = 'The system prompt status is not loaded yet.';
const WORKFLOWS_NOTE =
  'Let the agent plan and run a multi-step workflow per task instead of a single-shot reply.';
const ULTRACODE_NOTE =
  'X-High effort and a planned workflow for each message. The ultracode keyword only takes effect on ' +
  'messages you type yourself. Turning Ultracode off restores your previous reasoning effort.';

interface LoadError {
  readonly message: string;
  readonly retry: () => Promise<unknown>;
}

/**
 * "Agent behaviour" card on the Advanced tab (pattern map rows A10, A11, A26, A27, A29).
 *
 * Aligned setting rows for System prompt mode, Ultracode, Dynamic workflows and Chat reasoning
 * effort (G9: the same value as Providers > Main Agent effort). Every write is S-sel through {@link SettingsSaveFeedbackService.saveGeneric}:
 * "Saved" appears only after the write's own result, a failed write leaves the control
 * on the saved value and raises an alert toast (D15), and Undo is a real write of the
 * previous value.
 *
 * `EffortStateService.setEffort` resolves whether its write landed (it rolls its signal back on
 * failure); the effort write is decided from that result (map Â§9 item 11, Batch 55b m-3).
 * Ultracode decides the same way inside `UltracodeStateService`.
 */
@Component({
  selector: 'ptah-agent-behaviour-section',
  standalone: true,
  imports: [
    SettingsBusyDisabledDirective,
    LucideAngularModule,
    NativePopoverComponent,
    SystemPromptDrawerComponent,
    PtahButtonDirective,
    PtahToggleDirective,
    PtahIconButtonDirective,
    PtahFormSectionComponent,
    PtahSettingRowComponent,
    PtahStatusComponent,
    PtahAlertComponent,
    PtahRichSelectComponent,
    PtahSelectIconDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      data-glass-surface="content"
      aria-labelledby="agent-behaviour-heading"
      data-testid="agent-behaviour-card"
    >
      <h2 id="agent-behaviour-heading" class="sr-only">Agent behaviour</h2>
      <ptah-form-section
        id="advanced-agent-behaviour"
        flushInGlass
        class="[[data-glass=on]_&>section]:[border-bottom:0]"
        heading="Agent behaviour"
        [icon]="BotIcon"
        description="How the main agent plans and how hard it works."
        [wide]="true"
        [level]="2"
        [divider]="true"
      >
        @for (failure of loadErrors(); track failure.message) {
          <ptah-alert
            tone="error"
            role="alert"
            live="assertive"
            data-testid="agent-behaviour-load-error"
            >{{ failure.message }}
            <button
              alertAction
              type="button"
              ptahButton
              variant="ghost"
              size="xs"
              (click)="failure.retry()"
              data-testid="agent-behaviour-load-retry"
            >
              Retry
            </button></ptah-alert
          >
        }
        <!-- One container for the rows: the first row has no top padding and the last row has no divider. -->
        <div class="flex flex-col" data-testid="agent-behaviour-rows">
        <ptah-setting-row
          controlAlign="end"
          edgePadding="trim"
          label="System prompt mode"
          controlId="agent-behaviour-prompt-toggle"
          [hint]="promptNote()"
          hintElementId="agent-behaviour-prompt-note"
          data-testid="agent-behaviour-row-prompt"
        >
          <span meta class="sr-only" data-testid="agent-behaviour-prompt-status"
            ><ptah-status
              [status]="promptEnabled() ? 'online' : 'offline'"
              [label]="promptEnabled() ? 'Ptah Enhanced' : 'Default'"
            />{{
              promptEnabled()
                ? 'Active for all sessions'
                : 'Standard system prompt'
            }}</span
          >
          <button
            action
            type="button"
            ptahIconButton
            label="System prompt details"
            (click)="drawerOpen.set(true)"
            data-testid="agent-behaviour-prompt-details"
          >
            <lucide-angular [img]="PanelRightOpenIcon" class="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <input
            id="agent-behaviour-prompt-toggle"
            type="checkbox"
            ptahToggle
            [checked]="promptEnabled()"
            [ptahBusyDisabled]="promptToggleDisabled() || saving()"
            (change)="onPromptModeChange($event)"
            aria-label="Toggle Enhanced System Prompt"
            aria-describedby="agent-behaviour-prompt-note"
          />
        </ptah-setting-row>
        <ptah-setting-row
          controlAlign="end"
          edgePadding="trim"
          label="Ultracode"
          controlId="agent-behaviour-ultracode-toggle"
          [hint]="ultracodeHint"
          hintElementId="agent-behaviour-ultracode-note"
          data-testid="agent-behaviour-row-ultracode"
        >
          <span meta class="sr-only" data-testid="agent-behaviour-ultracode-status"
            >{{ ultracode.enabled() ? 'On' : 'Off' }} Pins X-High while on</span
          >
          <ptah-native-popover
            action
            [isOpen]="ultracodeInfoOpen()"
            [keepInViewport]="true"
            placement="bottom-end"
            (closed)="ultracodeInfoOpen.set(false)"
          >
            <button trigger type="button" ptahIconButton label="About Ultracode"
              (click)="ultracodeInfoOpen.set(!ultracodeInfoOpen())"
              data-testid="agent-behaviour-ultracode-info">
              <lucide-angular [img]="InfoIcon" class="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <p content class="max-w-sm" data-testid="agent-behaviour-ultracode-info-text">{{ ultracodeNote }}</p>
          </ptah-native-popover>
          <input
            id="agent-behaviour-ultracode-toggle"
            type="checkbox"
            ptahToggle
            [checked]="ultracode.enabled()"
            [ptahBusyDisabled]="saving()"
            (change)="onUltracodeChange($event)"
            aria-label="Toggle Ultracode mode"
            aria-describedby="agent-behaviour-ultracode-note"
          />
        </ptah-setting-row>
        <ptah-setting-row
          controlAlign="end"
          edgePadding="trim"
          label="Dynamic workflows"
          controlId="agent-behaviour-workflows-toggle"
          [hint]="workflowsNote"
          hintElementId="agent-behaviour-workflows-note"
          data-testid="agent-behaviour-row-workflows"
        >
          <span meta class="sr-only" data-testid="agent-behaviour-workflows-status">{{
            workflowsLoaded()
              ? workflowsEnabled()
                ? 'On'
                : 'Off'
              : 'Not loaded'
          }}</span>
          <input
            id="agent-behaviour-workflows-toggle"
            type="checkbox"
            ptahToggle
            [checked]="workflowsEnabled()"
            [ptahBusyDisabled]="!workflowsLoaded() || saving()"
            (change)="onWorkflowsChange($event)"
            aria-label="Toggle dynamic workflows"
            aria-describedby="agent-behaviour-workflows-note"
          />
        </ptah-setting-row>
        <ptah-setting-row
          controlAlign="end"
          edgePadding="trim"
          label="Chat reasoning effort"
          aria-label="Chat reasoning effort"
          controlId="agent-behaviour-effort"
          [hint]="effortNote()"
          hintElementId="agent-behaviour-effort-note"
          data-testid="agent-behaviour-row-effort"
        >
          <ptah-select
            #effortSelect
            triggerId="agent-behaviour-effort"
            labelledBy="agent-behaviour-effort-title"
            label="Chat reasoning effort"
            [attr.aria-label]="'Chat reasoning effort: ' + effortLabel() + '. Change effort'"
            aria-describedby="agent-behaviour-effort-note"
            size="sm"
            class="w-56"
            [options]="effortChoices"
            [value]="currentEffort()"
            (valueChange)="selectEffort($event)"
            [disabled]="saving() || ultracode.enabled()"
            data-testid="agent-behaviour-effort-value"
          >
            <ng-template ptahSelectIcon let-choice let-place="place">
              @if (place === 'option') {
                <span
                  [attr.data-testid]="
                    'agent-behaviour-effort-choice-' +
                    (choice.value || 'default')
                  "
                ></span>
              }
            </ng-template>
          </ptah-select>
        </ptah-setting-row>
        </div>
      </ptah-form-section>
    </section>
    @defer (when drawerOpen()) {
      <ptah-system-prompt-drawer
        [isOpen]="drawerOpen()"
        (closed)="drawerOpen.set(false)"
        (changed)="loadPromptStatus()"
      />
    }
  `,

})
export class AgentBehaviourSectionComponent implements OnInit {
  private readonly rpcService = inject(ClaudeRpcService);
  private readonly workspaceScope = inject(WorkspaceScopeService);
  private readonly effortState = inject(EffortStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  readonly ultracode = inject(UltracodeStateService);
  private readonly effortSelect =
    viewChild<PtahRichSelectComponent<EffortLevel | ''>>('effortSelect');

  readonly BotIcon = Bot;
  readonly SparklesIcon = Sparkles;
  readonly InfoIcon = Info;
  readonly PanelRightOpenIcon = PanelRightOpen;
  readonly AlertCircleIcon = AlertCircle;
  readonly effortChoices = EFFORT_CHOICES.map((choice) => ({ ...choice, icon: choice.value || 'default' }));
  readonly workflowsNote = WORKFLOWS_NOTE;
  readonly ultracodeNote = ULTRACODE_NOTE;
  readonly ultracodeHint = 'Plan each message with X-High effort.';
  readonly ultracodeInfoOpen = signal(false);

  readonly drawerOpen = signal(false);

  /** Save triggers are disabled while any settings write is in flight (D3). */
  readonly saving = this.feedback.saving;

  private readonly promptLoading = signal(true);
  private readonly workflowsLoading = signal(true);
  private readonly promptStatus =
    signal<EnhancedPromptsGetStatusResponse | null>(null);
  private readonly promptLoadError = signal<string | null>(null);
  readonly promptEnabled = computed(
    () => this.promptStatus()?.enabled ?? false,
  );
  /** The mode can only be turned on once a prompt has been generated (A10). */
  readonly promptToggleDisabled = computed(
    () =>
      !(this.promptStatus()?.hasGeneratedPrompt ?? false) &&
      !this.promptEnabled(),
  );

  /** `workflows.disabled`; `null` until `agent:getConfig` answers. */
  private readonly workflowsDisabled = signal<boolean | null>(null);
  private readonly workflowsLoadError = signal<string | null>(null);
  readonly workflowsLoaded = computed(() => this.workflowsDisabled() !== null);
  readonly workflowsEnabled = computed(
    () => this.workflowsDisabled() === false,
  );

  /** A failed status read never claims there is no prompt: until one read succeeds the note says it is not loaded. */
  readonly promptNote = computed(() => {
    if (this.promptStatus() === null) return PROMPT_NOTE_UNKNOWN;
    return this.promptToggleDisabled() ? PROMPT_NOTE_WIZARD : PROMPT_NOTE_ON;
  });

  readonly effortNote = computed(
    () =>
      `Same value as Providers > Main Agent effort${this.ultracode.enabled() ? ' Â· Pinned to X-High by Ultracode' : ''}`,
  );

  readonly loadErrors = computed<readonly LoadError[]>(() => {
    const errors: LoadError[] = [];
    const prompt = this.promptLoadError();
    const workflows = this.workflowsLoadError();
    if (prompt !== null)
      errors.push({ message: prompt, retry: () => this.loadPromptStatus() });
    if (workflows !== null)
      errors.push({ message: workflows, retry: () => this.loadWorkflows() });
    return errors;
  });

  readonly currentEffort = computed<EffortLevel | ''>(
    () => this.effortState.currentEffort() ?? '',
  );
  readonly effortLabel = computed(
    () =>
      EFFORT_CHOICES.find((choice) => choice.value === this.currentEffort())
        ?.label ?? 'Default',
  );
  private readonly overview = inject(AdvancedOverviewStore, { optional: true });

  constructor() {
    effect(() => {
      const loaded = !this.promptLoading() && !this.workflowsLoading() &&
        this.promptStatus() !== null && this.workflowsLoaded();
      const failed = this.loadErrors().length > 0;
      const enabled = this.ultracode.enabled();
      const effort = this.effortLabel();
      untracked(() => {
        if (!loaded || failed) {
          this.overview?.clear('agent-behaviour');
        } else {
          this.overview?.report('agent-behaviour', {
            value: enabled ? 'Ultracode on' : 'Ultracode off',
            meta: `${effort} effort`,
            tone: 'info',
          });
        }
      });
    });
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadPromptStatus(), this.loadWorkflows()]);
  }

  /** A10, S-sel. Undo writes the previous mode back. */
  async onPromptModeChange(event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const previous = this.promptEnabled();
    await this.feedback.saveGeneric({
      label: 'system prompt mode',
      write: () => this.writePromptMode(!previous),
      undo: () => this.writePromptMode(previous),
    });
    // OnPush keeps the binding when the saved value did not change: put the DOM back on it.
    checkbox.checked = this.promptEnabled();
  }

  /** A26, S-sel from the shared select. Undo writes the previous effort back. */
  async selectEffort(value: EffortLevel | '' | null): Promise<void> {
    if (value === null || value === this.currentEffort()) return;
    const previous = this.effortState.currentEffort();
    const next = value === '' ? undefined : value;
    await this.feedback.saveGeneric({
      label: 'chat reasoning effort',
      write: () => this.writeEffort(next),
      undo: () => this.writeEffort(previous),
    });
    // A fast failure sets the effort and rolls it back in one tick, so the `[value]` binding never
    // changes and the select keeps the picked option: put the select back on the saved effort.
    this.effortSelect()?.value.set(this.currentEffort());
  }

  /** A27, S-sel. Undo writes the inverse back. */
  async onWorkflowsChange(event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const nextDisabled = !checkbox.checked;
    await this.feedback.saveGeneric({
      label: 'dynamic workflows',
      write: () => this.writeWorkflowsDisabled(nextDisabled),
      undo: () => this.writeWorkflowsDisabled(!nextDisabled),
    });
    checkbox.checked = this.workflowsEnabled();
  }

  /** A29, S-sel. Turning it off restores the effort Ultracode replaced; Undo switches back. */
  async onUltracodeChange(event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const next = checkbox.checked;
    await this.feedback.saveGeneric({
      label: 'Ultracode',
      write: () => this.writeUltracode(next),
      undo: () => this.writeUltracode(!next),
    });
    checkbox.checked = this.ultracode.enabled();
  }

  /**
   * The host answers a failed status check inside a successful RPC with a zeroed status plus `error`
   * (`enhanced-prompts-rpc.handlers.ts:185-192`); that is a load failure, not "no prompt" (lane Serious 1).
   */
  protected async loadPromptStatus(): Promise<boolean> {
    this.promptLoading.set(true);
    try {
      const result = await this.rpcService.call('enhancedPrompts:getStatus', {
        workspacePath: this.workspaceScope.activeWorkspacePath() ?? '.',
      });
      if (result.isSuccess() && !result.data.error) {
        this.promptStatus.set(result.data);
        this.promptLoadError.set(null);
        this.promptLoading.set(false);
        return true;
      }
    } catch {
      // Falls through to the fixed load error below.
    }
    this.promptLoading.set(false);
    this.promptLoadError.set(PROMPT_STATUS_LOAD_FAILED);
    return false;
  }

  private async loadWorkflows(): Promise<void> {
    this.workflowsLoading.set(true);
    try {
      const result = await this.rpcService.call('agent:getConfig', undefined);
      if (result.isSuccess()) {
        this.workflowsDisabled.set(result.data.workflowsDisabled ?? false);
        this.workflowsLoadError.set(null);
      } else {
        this.workflowsLoadError.set(WORKFLOWS_LOAD_FAILED);
      }
    } catch {
      this.workflowsLoadError.set(WORKFLOWS_LOAD_FAILED);
    } finally {
      this.workflowsLoading.set(false);
    }
  }

  /**
   * Writes the mode, then re-reads the status the badge and checkbox show. When that re-read fails the write
   * still stands: the checkbox and badge show the written value and the load error says the status was not
   * re-read, so "Saved" never sits next to a stale checkbox (Moderate 8, lane FM-3).
   */
  private async writePromptMode(enabled: boolean): Promise<WriteResult> {
    try {
      const result = await this.rpcService.call('enhancedPrompts:setEnabled', {
        workspacePath: this.workspaceScope.activeWorkspacePath() ?? '.',
        enabled,
      });
      if (!result.isSuccess() || !result.data.success) {
        return { ok: false, message: PROMPT_MODE_SAVE_FAILED };
      }
    } catch {
      return { ok: false, message: PROMPT_MODE_SAVE_FAILED };
    }
    if (!(await this.loadPromptStatus())) {
      this.promptStatus.update((status) =>
        status === null ? status : { ...status, enabled },
      );
    }
    return { ok: true };
  }

  /** Map Â§9 item 11: decided from the write's own result, never from a read-back of the shared signal. */
  private async writeEffort(
    effort: EffortLevel | undefined,
  ): Promise<WriteResult> {
    if (this.ultracode.enabled()) return { ok: false, message: EFFORT_PINNED };
    return (await this.effortState.setEffort(effort))
      ? { ok: true }
      : { ok: false, message: EFFORT_SAVE_FAILED };
  }

  private async writeWorkflowsDisabled(
    disabled: boolean,
  ): Promise<WriteResult> {
    try {
      const result = await this.rpcService.call('agent:setConfig', {
        workflowsDisabled: disabled,
      });
      if (!result.isSuccess() || !result.data.success) {
        return { ok: false, message: WORKFLOWS_SAVE_FAILED };
      }
    } catch {
      return { ok: false, message: WORKFLOWS_SAVE_FAILED };
    }
    this.workflowsDisabled.set(disabled);
    return { ok: true };
  }

  /** `UltracodeStateService` reads the effort back and keeps the mode on its saved side. */
  private async writeUltracode(enabled: boolean): Promise<WriteResult> {
    if (await this.ultracode.toggle(enabled)) return { ok: true };
    return {
      ok: false,
      message: enabled ? ULTRACODE_ON_FAILED : ULTRACODE_OFF_FAILED,
    };
  }
}
