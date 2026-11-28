import { PtahFieldComponent, PtahInputDirective } from '@ptah-extension/ui';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ChevronDown, LucideAngularModule, X } from 'lucide-angular';
import {
  NativePopoverComponent,
  PtahBadgeDirective,
  PROVIDER_MODELS_LOADER,
  ProviderModelsNoticeComponent,
  PtahButtonDirective,
  PtahRichSelectComponent,
  PtahIconButtonDirective,
  type ProviderIdentityOption,
} from '@ptah-extension/ui';
import {
  AppStateManager,
  ClaudeRpcService,
  LoggingService,
} from '@ptah-extension/core';
import {
  type AgentSetConfigParams,
  type DecisionModelStatusDto,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { formatProviderDisplayName } from './provider-consumer-rows';
import {
  DECISION_KIND_OPTIONS,
  buildDecisionRow,
  decisionDraftForKind,
  decisionDraftFrom,
  decisionModelInput,
  decisionModelLabel,
  decisionModelPlaceholder,
  endpointFieldError,
  hostSaveSentence,
  parseDecisionModelStatus,
  sameDecisionSelection,
  storedKeyBoundTo,
  storedKeyKnown,
  type DecisionEndpointField,
  type DecisionModelDraft,
} from './decision-model-row.view';
import {
  DECISION_ACTION,
  DECISION_FOCUS,
  DECISION_INPUT,
  DECISION_INPUT_INVALID,
  DECISION_KEY_TEXT,
  DECISION_LABEL,
  DecisionModelKeyFieldComponent,
  type DecisionKeyedKind,
} from './decision-model-key-field.component';
import {
  IDLE_SUGGESTIONS,
  decisionModelHelp,
  hasDecisionSuggestions,
  loadDecisionSuggestions,
  type DecisionSuggestions,
} from './decision-model-suggestions';
import { DecisionModelBaseUrlFieldComponent } from './decision-model-row.base-url-field.component';
import { DecisionModelTimeoutFieldComponent } from './decision-model-row.timeout-field.component';
import {
  decisionEditorMaxHeight,
  wrapEditorTab,
} from './decision-model-row.popover';

const CELL = `flex w-full min-w-0 items-center justify-between gap-2 text-left ${DECISION_FOCUS}`;
const RPC_TIMEOUT_MS = 5_000;
const SAVE_FAILED =
  'Could not save the decision model. The saved choice is unchanged.';

type WriteResult = { ok: true } | { ok: false; message: string };

/**
 * The Decision model row of Background Model Roles (TASK_2026_646 Req 1; TASK_2026_684 C13). It reads and writes only
 * through `agent:getConfig` / `agent:setConfig` (`decisionModel`, write-only `decisionModelJevApiKey` and
 * `decisionModelCustomApiKey`), and saves through `SettingsSaveFeedbackService.saveGeneric` like the other Settings
 * writes outside the Providers state.
 * - Kinds: Unset | Ollama decision model | Ollama Cloud | TypeSafe Jev | Custom endpoint | Structured-output model.
 *   Unset saves at once; the other kinds save with Save once their required fields are filled and valid.
 * - Ollama and Ollama Cloud models are free text; their suggestions list only decision-capable models
 *   (`agent:listDecisionModels`), with a notice when that filter could not be fully applied. Nothing is ever
 *   preselected. A structured-output model lists its provider's catalogue unfiltered (it has no structured-output flag).
 * - Ollama Cloud has no key field: it uses the Ollama Cloud provider key, set up through the provider wizard.
 * - The custom endpoint takes a base URL, a model and an optional key. Field hints mirror the host's URL rule and
 *   D4 (a key needs https unless the endpoint is on this machine); the host stays the authority on save.
 * - The key field (Jev, custom) is a password input that is never prefilled; a stored key is never shown. Removing the
 *   key is its own button, so an empty field never deletes it; it shows only while the host reports a stored key.
 * - A status read that fails shows "not reachable" and never blocks saving. So does an `unset` selection the host
 *   reports as `unreachable` (it could not read the stored selection): that save offers no Undo, so it can never
 *   write `unset` over the real stored choice. Host `detail` is plain text. Logs carry fixed text and an error type.
 */
@Component({
  selector: 'ptah-decision-model-row',
  standalone: true,
  imports: [
    PtahFieldComponent,
    PtahInputDirective,
    LucideAngularModule,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahRichSelectComponent,
    PtahIconButtonDirective,
    NativePopoverComponent,
    DecisionModelKeyFieldComponent,
    DecisionModelBaseUrlFieldComponent,
    DecisionModelTimeoutFieldComponent,
    ProviderModelsNoticeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Angular owns (and removes) this listener with the component.
  host: {
    class: 'block min-w-0',
    '(window:resize)': 'editing() && fitEditor()',
  },
  templateUrl: './decision-model-row.component.html',
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }
    .consumer-role {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      min-height: 5.5rem;
      padding-bottom: var(--ptah-gap-field);
    }
    @container (max-width: 400px) {
      .consumer-role {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    :host ::ng-deep .consumer-cell-popover > .popover-trigger {
      display: block;
      width: 100%;
      min-width: 0;
    }
  `,
})
export class DecisionModelRowComponent implements OnInit {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly loader = inject(PROVIDER_MODELS_LOADER);
  private readonly injector = inject(Injector);
  private readonly appState = inject(AppStateManager);

  protected readonly ChevronIcon = ChevronDown;
  protected readonly CloseIcon = X;
  protected readonly action = DECISION_ACTION;
  protected readonly cellClass = CELL;
  protected readonly kindOptions = DECISION_KIND_OPTIONS;
  protected readonly providerSelectOptions = computed(() => {
    const options = [
      { value: '', label: 'Choose a provider' },
      ...this.providers().map((provider) => ({
        value: provider.id,
        label: provider.name,
      })),
    ];
    const saved = this.status()?.selection;
    if (
      saved?.kind === 'structured' &&
      !options.some(({ value }) => value === saved.providerId)
    ) {
      options.push({
        value: saved.providerId,
        label: `${formatProviderDisplayName(saved.providerId)} (unavailable)`,
      });
    }
    return options;
  });
  protected readonly inputClass = DECISION_INPUT;
  protected readonly invalidInputClass = DECISION_INPUT_INVALID;
  protected readonly label = DECISION_LABEL;
  protected readonly kinds = DECISION_KIND_OPTIONS;
  protected readonly keyText = DECISION_KEY_TEXT;

  readonly disabled = input<boolean>(false);
  /** The configured provider connections a structured-output model can run on. */
  readonly providers = input<readonly ProviderIdentityOption[]>([]);
  readonly setupProviderRequested = output<string>();

  /** `agent:getConfig` state of this row; `error` shows "not reachable" and leaves saving open. */
  protected readonly load = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly status = signal<DecisionModelStatusDto | null>(null);
  protected readonly editing = signal(false);
  protected readonly draft = signal<DecisionModelDraft>(
    decisionDraftFrom(null),
  );
  /** The key being typed for the draft's kind (Jev or custom); never filled from the host, never logged. */
  protected readonly apiKey = signal('');
  protected readonly suggestions =
    signal<DecisionSuggestions>(IDLE_SUGGESTIONS);
  private suggestionRequest = 0;
  /** The editor's height cap in px (`fitEditor`), set before it opens so the popover positions the capped size. */
  protected readonly editorMaxHeight = signal<number | null>(null);

  private readonly cellRef = viewChild<ElementRef<HTMLButtonElement>>('cell');
  /** The popover focuses its panel on open; `(opened)` moves focus on to this dialog so AT lands on its role. */
  protected readonly editorRef = viewChild<ElementRef<HTMLElement>>('editor');
  private readonly keyFieldRef = viewChild(DecisionModelKeyFieldComponent);

  /** Save triggers wait while any save runs (D3). */
  protected readonly busy = this.feedback.saving;
  protected readonly row = computed(() => buildDecisionRow(this.status()));
  protected readonly markProviderId = computed(() => {
    const selection = this.status()?.selection;
    if (selection?.kind === 'ollama' || selection?.kind === 'ollama-cloud')
      return selection.kind;
    return selection?.kind === 'structured' ? selection.providerId : '';
  });
  private readonly pendingInput = computed(() =>
    decisionModelInput(this.draft()),
  );
  /** The draft's kind calls a System One endpoint, so the request timeout setting applies to it. */
  protected readonly usesSystemOne = computed(() => {
    const kind = this.draft().kind;
    return kind !== 'unset' && kind !== 'structured';
  });
  /** The draft's kind when its key is entered in this row. */
  protected readonly keyedKind = computed((): DecisionKeyedKind | null => {
    const kind = this.draft().kind;
    return kind === 'jev' || kind === 'custom' ? kind : null;
  });
  private readonly keyTyped = computed(
    () => this.keyedKind() !== null && this.apiKey().trim() !== '',
  );
  /** The host's knowledge of the draft kind's stored key (`storedKeyKnown`); `null` when unknown. */
  private readonly keyStoredKnown = computed(() =>
    storedKeyKnown(this.keyedKind(), this.status()),
  );
  /**
   * Whether "Remove stored key" is offered: only while the host reports a stored key for the saved selection of the
   * draft's kind. The host reports `apiKeyStored` for the saved kind only, so an unknown key offers no delete (P4 4).
   */
  protected readonly keyMayBeStored = computed(
    () => this.keyStoredKnown() === true,
  );
  /** The first invalid custom endpoint field (D4 counts a typed key, or a stored key bound to the draft's origin). */
  private readonly endpointError = computed(() =>
    endpointFieldError(
      this.draft(),
      this.keyTyped() ||
        (this.keyStoredKnown() === true &&
          storedKeyBoundTo(this.draft().baseUrl, this.status()?.selection)),
    ),
  );
  protected readonly canSave = computed(() => {
    const selection = this.pendingInput();
    if (!selection || this.busy() || this.disabled()) return false;
    if (this.endpointError()) return false;
    return (
      this.keyTyped() ||
      !sameDecisionSelection(selection, this.status()?.selection ?? null)
    );
  });
  protected readonly modelLabel = computed(() =>
    decisionModelLabel(this.draft().kind),
  );
  protected readonly modelPlaceholder = computed(() =>
    decisionModelPlaceholder(this.draft().kind),
  );
  protected readonly modelHelp = computed(() =>
    decisionModelHelp(this.draft(), this.suggestions()),
  );
  /** The editor footer: only claims an Undo the next save will really offer (see `save`). */
  protected readonly footer = computed(() => {
    const base =
      'Unset saves at once and sends no decision request. Other choices save with Save.';
    if (!this.status())
      return `${base} The saved choice could not be read, so a save offers no Undo.`;
    return this.keyedKind()
      ? `${base} Undo puts the previous choice back; a key change has no Undo.`
      : `${base} Undo puts the previous choice back.`;
  });

  ngOnInit(): void {
    void this.reload();
  }

  /**
   * The inline hint of a custom endpoint field, or `null`. A field that is still empty shows none: Save is disabled
   * until it is filled, and a hint before any typing would only be noise.
   */
  protected fieldError(field: DecisionEndpointField): string | null {
    const error = this.endpointError();
    if (!error || error.field !== field) return null;
    return this.draft()[field].trim() ? error.message : null;
  }

  protected describedBy(field: DecisionEndpointField): string {
    const id = `decision-model-${field === 'baseUrl' ? 'base-url' : 'model'}`;
    return this.fieldError(field) ? `${id}-help ${id}-error` : `${id}-help`;
  }

  /**
   * Reads the row's status. A failed read keeps the last status out of view and shows "not reachable". So does an
   * unread selection (`unset` + `unreachable`, agent-rpc.handlers.ts `readDecisionModelStatus`): with no status, a
   * save offers no Undo, so the row never writes `unset` over the real stored selection.
   */
  protected async reload(): Promise<void> {
    if (!this.status()) this.load.set('loading');
    try {
      const result = await this.rpc.call('agent:getConfig', undefined, {
        timeout: RPC_TIMEOUT_MS,
      });
      const parsed = result.isSuccess()
        ? parseDecisionModelStatus(result.data.decisionModel)
        : null;
      const status = parsed && !selectionNotRead(parsed) ? parsed : null;
      this.status.set(status);
      this.load.set(status ? 'ready' : 'error');
    } catch (error: unknown) {
      this.logger.warn('DecisionModelRow', 'agent:getConfig failed', {
        errorType: errorTypeOf(error),
      });
      this.status.set(null);
      this.load.set('error');
    }
  }

  protected toggle(): void {
    if (this.editing()) {
      this.close();
      return;
    }
    // While a save runs the cell is only aria-disabled (it keeps focus): the click is refused here (D3).
    if (this.busy()) return;
    this.draft.set(decisionDraftFrom(this.status()?.selection ?? null));
    this.apiKey.set('');
    this.fitEditor();
    this.editing.set(true);
    void this.refreshSuggestions();
  }

  /** Closes the editor; focus goes back to the row's cell. The typed key is dropped. */
  protected close(): void {
    if (!this.editing()) return;
    this.editing.set(false);
    this.apiKey.set('');
    afterNextRender(() => this.cellRef()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /** Caps the editor to the room beside the cell (on open and on window resize). */
  protected fitEditor(): void {
    const cell = this.cellRef()?.nativeElement;
    const view = cell?.ownerDocument.defaultView;
    if (!cell || !view) return;
    this.editorMaxHeight.set(
      decisionEditorMaxHeight(cell.getBoundingClientRect(), view.innerHeight),
    );
  }

  /** Tab stays inside the open editor; Escape is the popover's own close. */
  protected onEditorKeydown(event: KeyboardEvent): void {
    const editor = this.editorRef()?.nativeElement;
    if (this.editing() && editor) wrapEditorTab(event, editor);
  }

  protected onKind(value: string | null): void {
    const kind = DECISION_KIND_OPTIONS.find(
      (option) => option.value === value,
    )?.value;
    if (!kind) return;
    this.draft.set(
      decisionDraftForKind(kind, this.status()?.selection ?? null),
    );
    // A key typed for one kind is never sent for another.
    this.apiKey.set('');
    void this.refreshSuggestions();
    if (kind === 'unset') void this.save();
  }

  protected onProvider(providerId: string): void {
    if (this.draft().providerId === providerId) return;
    this.draft.update((draft) => ({ ...draft, providerId, model: '' }));
    void this.refreshSuggestions();
  }

  /** A typed base URL or model; suggestions never write here (no preselection). */
  protected onField(field: DecisionEndpointField, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const value = event.target.value;
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected onBaseUrl(baseUrl: string): void {
    this.draft.update((draft) => ({ ...draft, baseUrl }));
  }

  /** Ollama Cloud's key is the provider key (D1): the provider wizard sets it up, not this row. */
  protected setUpOllamaCloud(): void {
    this.close();
    this.setupProviderRequested.emit('ollama-cloud');
  }

  protected connectProvider(): void {
    this.close();
    this.appState.requestSettingsTab({
      tab: 'providers',
      section: 'more-providers',
    });
  }

  /**
   * Saves the draft with Undo. A typed Jev or custom endpoint key goes in the same write (trimmed; blank is never
   * sent, so it cannot delete the stored key) and that save offers no Undo: a key cannot be put back. With no status
   * read (`status` is `null`, including an unread selection) there is no Undo either: the previous choice is unknown.
   */
  protected async save(): Promise<void> {
    const selection = this.pendingInput();
    if (!selection || !this.canSave()) return;
    const keyKind = this.keyedKind();
    const key = keyKind ? this.apiKey().trim() : '';
    const previous = this.status()?.selection ?? null;
    const params: AgentSetConfigParams = !key
      ? { decisionModel: selection }
      : keyKind === 'jev'
        ? { decisionModel: selection, decisionModelJevApiKey: key }
        : { decisionModel: selection, decisionModelCustomApiKey: key };
    const result = await this.feedback.saveGeneric({
      label: 'decision model',
      write: () => this.write(params, SAVE_FAILED),
      undo:
        previous && !key
          ? () => this.write({ decisionModel: previous }, SAVE_FAILED)
          : null,
    });
    if (result !== 'saved') return;
    this.apiKey.set('');
  }

  /**
   * The explicit delete: `''` for the draft kind's key field removes the stored key (no Undo). The button then goes
   * away, so focus moves to the key field.
   */
  protected async removeKey(): Promise<void> {
    const kind = this.keyedKind();
    if (!kind || this.busy() || this.disabled()) return;
    this.apiKey.set('');
    const params: AgentSetConfigParams =
      kind === 'jev'
        ? { decisionModelJevApiKey: '' }
        : { decisionModelCustomApiKey: '' };
    const result = await this.feedback.saveGeneric({
      label: DECISION_KEY_TEXT[kind].removal,
      write: () => this.write(params, DECISION_KEY_TEXT[kind].removeFailed),
      undo: null,
    });
    if (result !== 'saved') return;
    afterNextRender(() => this.keyFieldRef()?.focus(), {
      injector: this.injector,
    });
  }

  /**
   * One `agent:setConfig` write, then a status re-read; a failed re-read shows "not reachable", not a failed save.
   * The toast carries a fixed sentence: the row's own, or one of the host's fixed shared constants (DC12).
   */
  private async write(
    params: AgentSetConfigParams,
    failed: string,
  ): Promise<WriteResult> {
    try {
      const result = await this.rpc.call('agent:setConfig', params, {
        timeout: RPC_TIMEOUT_MS,
      });
      // The RPC boundary is untrusted at runtime: only a literal `success: true` confirms the write.
      if (!result.isSuccess() || result.data.success !== true) {
        const hostError =
          result.isSuccess() && result.data.success === false
            ? result.data.error
            : undefined;
        return { ok: false, message: hostSaveSentence(hostError) ?? failed };
      }
    } catch (error: unknown) {
      this.logger.warn('DecisionModelRow', 'agent:setConfig failed', {
        errorType: errorTypeOf(error),
      });
      return { ok: false, message: failed };
    }
    await this.reload();
    return { ok: true };
  }

  /** The saved-list notice's Retry: loads the provider's list again. */
  protected retrySuggestions(): void {
    void this.refreshSuggestions();
  }

  /** Loads the suggestions for the draft's kind; a newer request wins. Never writes `draft.model` (no preselection). */
  private async refreshSuggestions(): Promise<void> {
    const request = ++this.suggestionRequest;
    const { kind, providerId } = this.draft();
    if (!hasDecisionSuggestions(kind, providerId)) {
      this.suggestions.set(IDLE_SUGGESTIONS);
      return;
    }
    this.suggestions.set({ status: 'loading', ids: [], filter: null });
    try {
      const next = await loadDecisionSuggestions(
        kind,
        providerId,
        this.rpc,
        this.loader,
      );
      if (request === this.suggestionRequest) this.suggestions.set(next);
    } catch (error: unknown) {
      this.logger.warn('DecisionModelRow', 'model suggestions failed', {
        errorType: errorTypeOf(error),
      });
      if (request === this.suggestionRequest)
        this.suggestions.set({ status: 'error', ids: [], filter: null });
    }
  }
}

/**
 * The host's answer when it could not read the stored selection (Batch 40a D1): an `unset` selection with state
 * `unreachable`. A stored `unset` comes back with state `unset`, so this pair never describes a real choice.
 */
function selectionNotRead(status: DecisionModelStatusDto): boolean {
  return status.selection.kind === 'unset' && status.state === 'unreachable';
}

/** A safe log classification: the constructor name, never the error's message, stack or fields (P4 S-3). */
function errorTypeOf(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error;
}
