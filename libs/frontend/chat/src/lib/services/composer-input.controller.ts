import {
  DestroyRef,
  Injectable,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  type ElementRef,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import {
  File as FileIcon,
  Folder as FolderIcon,
  ImageIcon,
} from 'lucide-angular';
import {
  CommandDiscoveryFacade,
  type CommandSuggestion,
} from '@ptah-extension/core';
import { PROMPT_CATALOGUE } from '@ptah-extension/chat-ui';
import {
  FilePickerService,
  type ChatFile,
  type FileSuggestion,
} from './file-picker.service';
import { ComposerAttachmentsService } from './composer-attachments.service';
import {
  COMPOSER_TRIGGER_CACHE_ENABLED,
  MAX_CACHED_TRIGGER_QUERIES,
  TRIGGER_PROJECTION_DEBOUNCE_MS,
} from './composer-trigger-scheduler';
import type { AtTriggerEvent } from '../directives/at-trigger.directive';
import type { SlashTriggerEvent } from '../directives/slash-trigger.directive';
import type {
  SuggestionGroup,
  SuggestionItem,
  UnifiedSuggestionsDropdownComponent,
} from '../components/file-suggestions/unified-suggestions-dropdown.component';

type FileSuggestionItem = Extract<SuggestionItem, { type: 'file' }>;
type CommandSuggestionItem = Extract<SuggestionItem, { type: 'command' }>;

/** A titled set of `/` entries a lane offers (Commands, Skills). */
export interface ComposerCommandGroup {
  readonly label: string;
  readonly commands: readonly CommandSuggestion[];
  /** Shown as one non-selectable row when the group has no commands. */
  readonly emptyReason?: string;
}

/**
 * Where the `/` list comes from.
 * - `discovery`: the workspace command catalogue (`CommandDiscoveryFacade`),
 *   as the main chat composer lists it.
 * - `loading`: the list is not known yet; the dropdown shows its spinner row.
 * - `unsupported`: the target takes no `/` entries; one notice row says why.
 * - `ready`: a fixed list in titled groups (a lane's commands and skills).
 */
export type ComposerCommandSource =
  | { readonly state: 'discovery' }
  | { readonly state: 'loading' }
  | { readonly state: 'unsupported'; readonly reason: string }
  | {
      readonly state: 'ready';
      readonly groups: readonly ComposerCommandGroup[];
    };

/** How a file chosen from `@` reaches the agent. */
export type ComposerFileMode = 'reference' | 'path-text';

/** The parts of the suggestions dropdown the controller drives. */
export type ComposerSuggestionsPanel = Pick<
  UnifiedSuggestionsDropdownComponent,
  'listboxId' | 'getActiveDescendantId' | 'onKeyDown'
>;

/** What the owning composer wires into the controller. */
export interface ComposerInputSources {
  /**
   * The draft text. The owner keeps it and syncs the textarea's `input`
   * events into it (drafts, send and restore are the owner's); the
   * controller edits it on insertions.
   */
  readonly text: WritableSignal<string>;
  readonly textarea: Signal<ElementRef<HTMLTextAreaElement> | undefined>;
  readonly dropdown: Signal<ComposerSuggestionsPanel | undefined>;
  readonly commands: Signal<ComposerCommandSource>;
  readonly fileMode: Signal<ComposerFileMode>;
  /**
   * Why the target takes no files; null or absent when it does. While set,
   * `@` shows this reason as its one row and a file cannot be chosen.
   */
  readonly filesUnsupportedReason?: Signal<string | null>;
  /** Append the prompt catalogue after the `/` entries. */
  readonly prompts: boolean;
  /** Enter (no Shift) with the suggestions closed. */
  readonly submit: () => void;
  /** Ctrl/Cmd+Enter. Without it, Ctrl/Cmd+Enter submits like Enter. */
  readonly submitNow?: () => void;
}

/**
 * Textarea behaviour shared by the composers: `/` and `@` suggestions (with
 * the trigger projection debounce and the file query cache), suggestion
 * insertion, paste and image drop, voice transcript insertion and keys.
 * The owner keeps sending, drafts, restore, the fold and Stop.
 *
 * Provided per composer (component providers), like `ComposerCompactStore`.
 * Call `connect` once, from the owning component.
 */
@Injectable()
export class ComposerInputController {
  private readonly filePicker = inject(FilePickerService);
  private readonly commandDiscovery = inject(CommandDiscoveryFacade);
  private readonly attachments = inject(ComposerAttachmentsService);
  private readonly injector = inject(Injector);
  private readonly cacheEnabled = inject(COMPOSER_TRIGGER_CACHE_ENABLED);

  private readonly sources = signal<ComposerInputSources | null>(null);

  private readonly _showSuggestions = signal(false);
  readonly showSuggestions = this._showSuggestions.asReadonly();
  private readonly _suggestionMode = signal<
    'at-trigger' | 'slash-trigger' | null
  >(null);
  readonly suggestionMode = this._suggestionMode.asReadonly();
  /** Where the trigger (@, /) starts in the text. */
  private readonly _triggerPosition = signal(0);
  /** Current search query after the trigger. */
  private readonly _currentQuery = signal('');
  /** Query whose expensive local suggestion projection is ready to render. */
  private readonly _projectedQuery = signal('');
  private readonly _localSuggestions = signal<SuggestionItem[]>([]);
  private readonly _fileSuggestionCache = new Map<string, SuggestionItem[]>();
  private _commandSuggestions: CommandSuggestionItem[] | null = null;
  private _triggerProjectionTimeout: ReturnType<typeof setTimeout> | null =
    null;
  private readonly _isFetching = signal(false);
  private readonly _isDraggingOver = signal(false);
  /** Files are dragged over the composer. */
  readonly dragging = this._isDraggingOver.asReadonly();
  private readonly _statusNote = signal<string | null>(null);
  /** How the last chosen file was added, in path-text mode; else null. */
  readonly statusNote = this._statusNote.asReadonly();

  private readonly commandSource = computed<ComposerCommandSource>(
    () => this.sources()?.commands() ?? { state: 'discovery' },
  );
  private readonly filesBlockedReason = computed(
    () => this.sources()?.filesUnsupportedReason?.() ?? null,
  );

  /** Spinner row: a fetch is running, or the `/` source is still loading. */
  readonly isLoadingSuggestions = computed(
    () =>
      this._isFetching() ||
      (this._suggestionMode() === 'slash-trigger' &&
        this.commandSource().state === 'loading'),
  );

  /** Expose fetch error only when in @ mode (not stale from previous mode). */
  readonly filePickerError = computed(() =>
    this._suggestionMode() === 'at-trigger'
      ? this.filePicker.fetchError()
      : null,
  );

  /** One non-selectable row instead of the `/` list (source unsupported). */
  readonly suggestionNotice = computed(() => {
    const source = this.commandSource();
    const mode = this._suggestionMode();
    if (mode === 'at-trigger') return this.filesBlockedReason();
    return mode === 'slash-trigger' && source.state === 'unsupported'
      ? source.reason
      : null;
  });

  /** Titled `/` groups for a `ready` source; null for the flat list. */
  readonly suggestionGroups = computed<readonly SuggestionGroup[] | null>(
    () => {
      const source = this.commandSource();
      if (
        this._suggestionMode() !== 'slash-trigger' ||
        source.state !== 'ready'
      ) {
        return null;
      }
      const query = this._projectedQuery();
      const groups: SuggestionGroup[] = source.groups.map((group) => ({
        label: group.label,
        items: this.matchCommands(
          group.commands.map((command) => this.toCommandItem(command)),
          query,
        ),
        notice: group.commands.length === 0 ? group.emptyReason : undefined,
      }));
      if (this.sources()?.prompts) {
        groups.push({
          label: 'Prompts',
          items: this.toPromptSuggestionItems(query),
        });
      }
      return groups;
    },
  );

  /**
   * The selectable suggestions in order.
   * Hybrid approach: merges local fuzzy results + server-side remote results.
   * Local results appear immediately; remote results merge in when RPC completes.
   */
  readonly filteredSuggestions = computed(() => {
    const mode = this._suggestionMode();
    this._projectedQuery();

    if (mode === 'at-trigger') {
      if (this.filesBlockedReason() !== null) return [];
      const localResults = this._localSuggestions().filter(
        (suggestion): suggestion is FileSuggestionItem =>
          suggestion.type === 'file',
      );
      const remoteResults = this.filePicker.remoteResults();
      const seenPaths = new Set(localResults.map((f) => f.path));
      const merged = [...localResults];
      for (const remote of remoteResults) {
        if (!seenPaths.has(remote.path)) {
          merged.push(this.toFileSuggestionItem(remote));
          seenPaths.add(remote.path);
        }
      }

      return merged.slice(0, 40);
    }

    if (mode === 'slash-trigger') {
      const groups = this.suggestionGroups();
      if (groups) return groups.flatMap((group) => [...group.items]);
      if (this.suggestionNotice() !== null) return [];
      // A loading source shows only the spinner row, never an older list.
      if (this.commandSource().state === 'loading') return [];
      return this._localSuggestions();
    }

    return [];
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTriggerProjectionTimeout());
    // The path-text note belongs to the draft it describes.
    effect(() => {
      if (this.sources()?.text() === '') {
        untracked(() => this._statusNote.set(null));
      }
    });
  }

  /** Wire the composer's signals. Call once, from the owning component. */
  connect(sources: ComposerInputSources): void {
    this.sources.set(sources);
  }

  private get text(): WritableSignal<string> | null {
    return this.sources()?.text ?? null;
  }

  private textareaElement(): HTMLTextAreaElement | undefined {
    return this.sources()?.textarea()?.nativeElement;
  }

  /** Show a transient error near the input (auto-clears). */
  showError(message: string): void {
    this.attachments.showError(message);
  }

  handlePaste(event: ClipboardEvent): void {
    this.attachments.onPaste(event);
  }

  /** Dragover: show the drop zone for files. True when files are dragged. */
  handleDragOver(event: DragEvent): boolean {
    const hasFiles = Array.from(event.dataTransfer?.types ?? []).includes(
      'Files',
    );
    if (!hasFiles) return false;
    event.preventDefault();
    event.stopPropagation();
    this._isDraggingOver.set(true);
    return true;
  }

  /** Dragleave: hide the drop zone once the pointer leaves the composer. */
  handleDragLeave(event: DragEvent): void {
    const relatedTarget = event.relatedTarget as Node | null;
    const container = event.currentTarget as HTMLElement;
    if (!relatedTarget || !container.contains(relatedTarget)) {
      this._isDraggingOver.set(false);
    }
  }

  /** Drop: take the dropped images. */
  handleDrop(event: DragEvent): void {
    this._isDraggingOver.set(false);
    this.attachments.onDrop(event);
  }

  /** Insert a dictated transcript at the caret (or append, with a space). */
  insertTranscript(transcript: string): void {
    const text = this.text;
    const value = transcript.trim();
    if (!text || !value) return;

    const textarea = this.textareaElement();
    const currentValue = text();

    if (!textarea) {
      const needsSpace =
        currentValue.length > 0 && !currentValue.endsWith(' ') ? ' ' : '';
      text.set(currentValue + needsSpace + value);
      return;
    }

    const cursorStart = textarea.selectionStart ?? currentValue.length;
    const cursorEnd = textarea.selectionEnd ?? currentValue.length;
    const before = currentValue.substring(0, cursorStart);
    const after = currentValue.substring(cursorEnd);
    const atEndAfterText =
      cursorStart === currentValue.length && before.length > 0;
    const leadingSpace = atEndAfterText && !before.endsWith(' ') ? ' ' : '';
    const insertion = leadingSpace + value;
    const newValue = before + insertion + after;

    text.set(newValue);
    textarea.value = newValue;
    const newCursorPos = cursorStart + insertion.length;
    textarea.focus();
    textarea.setSelectionRange(newCursorPos, newCursorPos);
  }

  /**
   * Replace the whole text and focus the textarea. A folded composer opens
   * on the new text, so focus waits until it is no longer inert.
   */
  replaceText(content: string): void {
    this.text?.set(content);
    // `field-sizing: content` sizes the box to the new value.
    const textarea = this.textareaElement();
    if (textarea?.closest('[inert]')) {
      afterNextRender(() => textarea.focus({ preventScroll: true }), {
        injector: this.injector,
      });
    } else {
      textarea?.focus();
    }
  }

  /**
   * @ trigger activation (IMMEDIATE - no debounce): opens the dropdown as
   * soon as @ is detected.
   */
  handleAtActivated(event: AtTriggerEvent): void {
    this._suggestionMode.set('at-trigger');
    this._triggerPosition.set(event.triggerPosition);
    this._currentQuery.set(event.query);
    this._showSuggestions.set(true);
    this.refreshSuggestions(event.query);
    if (this.filesBlockedReason() === null) void this.fetchAtSuggestions();
  }

  /**
   * Debounced @ trigger: only updates the trigger position (it may shift if
   * the user edits before @). The query already holds the latest value.
   */
  handleAtTriggered(event: AtTriggerEvent): void {
    this._triggerPosition.set(event.triggerPosition);
  }

  handleAtClosed(): void {
    if (this._suggestionMode() === 'at-trigger') {
      this._showSuggestions.set(false);
      this._suggestionMode.set(null);
      this.filePicker.clearRemoteResults();
      this.clearTriggerProjectionTimeout();
    }
  }

  /** / trigger activation (IMMEDIATE - no debounce). */
  handleSlashActivated(event: SlashTriggerEvent): void {
    this._suggestionMode.set('slash-trigger');
    this._triggerPosition.set(0); // Slash always starts at position 0
    this._currentQuery.set(event.query);
    this._showSuggestions.set(true);
    this.refreshSuggestions(event.query);
    if (this.commandSource().state === 'discovery') {
      void this.fetchCommandSuggestions();
    }
  }

  /** Debounced / trigger: the query already holds the latest value. */
  handleSlashTriggered(): void {
    // Intentionally empty: handleQueryChanged already holds the latest query.
  }

  handleSlashClosed(): void {
    if (this._suggestionMode() === 'slash-trigger') {
      this._showSuggestions.set(false);
      this._suggestionMode.set(null);
      this.clearTriggerProjectionTimeout();
    }
  }

  /**
   * Immediate query changes for responsive filtering; also triggers the
   * debounced server-side search for @ file queries.
   */
  handleQueryChanged(query: string): void {
    this._currentQuery.set(query);
    this.scheduleSuggestionRefresh(query);
  }

  /** File tag (reference), path text, command or prompt insertion. */
  handleSuggestionSelected(suggestion: SuggestionItem): void {
    if (suggestion.type === 'file') {
      if (this.filesBlockedReason() !== null) {
        // The target takes no files: nothing is inserted.
      } else if (this.sources()?.fileMode() === 'path-text') {
        if (this.replaceTrigger(`${suggestion.path} `)) {
          this._statusNote.set(
            `Inserted ${suggestion.name} as path text in your message.`,
          );
        }
      } else {
        this.addFileTag(suggestion);
        this.removeTriggerText();
      }
    } else if (suggestion.type === 'command') {
      this.replaceTrigger(`/${suggestion.name} `);
    } else if (suggestion.type === 'prompt') {
      // A prompt prefills the composer for editing; it does not send.
      this.replaceText(suggestion.text);
    }

    this.closeSuggestions();
  }

  closeSuggestions(): void {
    this._showSuggestions.set(false);
    this._suggestionMode.set(null);
    this._currentQuery.set('');
    this.clearTriggerProjectionTimeout();
    this.filePicker.clearRemoteResults();
  }

  /**
   * The dropdown's listbox id for `aria-controls`, or null while closed.
   * It tells assistive technology which popup the combobox controls.
   */
  getListboxId(): string | null {
    if (!this.showSuggestions()) return null;
    return this.sources()?.dropdown()?.listboxId ?? null;
  }

  /**
   * The highlighted option's id for `aria-activedescendant`, or null.
   * Screen readers announce it without moving focus off the textarea.
   */
  getActiveDescendantId(): string | null {
    if (!this.showSuggestions()) return null;
    return this.sources()?.dropdown()?.getActiveDescendantId() ?? null;
  }

  /**
   * Keys: while the dropdown is open it takes the navigation keys; with it
   * closed, Enter submits (Shift+Enter is a new line) and Ctrl/Cmd+Enter
   * runs `submitNow` when the owner offers it. An Enter that commits IME
   * composition belongs to the IME: it neither submits nor picks a row.
   */
  handleKeyDown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) return;
    const sources = this.sources();
    const dropdown = sources?.dropdown();
    if (this.showSuggestions() && dropdown) {
      if (
        ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape'].includes(
          event.key,
        )
      ) {
        const handled = dropdown.onKeyDown(event);
        if (handled) {
          event.preventDefault();
          return;
        }
      }
    }
    if (!this.showSuggestions() && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sources) return;
      if ((event.ctrlKey || event.metaKey) && sources.submitNow) {
        sources.submitNow();
      } else {
        sources.submit();
      }
    }
  }

  /**
   * Keeps typing on the synchronous draft path. The potentially expensive
   * local search/filter work runs once after a brief quiet period instead of
   * for every trigger keystroke.
   */
  private scheduleSuggestionRefresh(query: string): void {
    this.clearTriggerProjectionTimeout();
    if (!this.cacheEnabled) {
      this.refreshSuggestions(query);
      return;
    }
    this._triggerProjectionTimeout = setTimeout(() => {
      this._triggerProjectionTimeout = null;
      this.refreshSuggestions(query);
    }, TRIGGER_PROJECTION_DEBOUNCE_MS);
  }

  private refreshSuggestions(query: string): void {
    const mode = this._suggestionMode();
    if (!mode) return;

    this._projectedQuery.set(query);
    if (mode === 'at-trigger') {
      const cached = this._fileSuggestionCache.get(query);
      if (cached) {
        this._localSuggestions.set(cached);
      } else {
        const suggestions = this.filePicker
          .searchFiles(query)
          .slice(0, 40)
          .map((file) => this.toFileSuggestionItem(file));
        this.cacheFileSuggestions(query, suggestions);
        this._localSuggestions.set(suggestions);
      }
      this.filePicker.searchFilesRemote(query);
      return;
    }

    // Lane sources are projected by `suggestionGroups` from the query.
    if (this.commandSource().state !== 'discovery') return;

    const commands: CommandSuggestionItem[] =
      this._commandSuggestions ??
      this.commandDiscovery
        .searchCommands('')
        .map((command) => this.toCommandItem(command));
    this._commandSuggestions = commands;
    // TASK_2026_721 D7: the prompt catalogue lives behind `/`, appended after
    // the commands so the dropdown renders one command group then prompts.
    this._localSuggestions.set([
      ...this.matchCommands(commands, query),
      ...(this.sources()?.prompts ? this.toPromptSuggestionItems(query) : []),
    ]);
  }

  private matchCommands(
    commands: readonly CommandSuggestionItem[],
    query: string,
  ): CommandSuggestionItem[] {
    return rankCommandMatches(commands, query);
  }

  private toCommandItem(command: CommandSuggestion): CommandSuggestionItem {
    return { type: 'command', ...command };
  }

  private toFileSuggestionItem(file: FileSuggestion): FileSuggestionItem {
    const isFolder = file.type === 'directory';
    return {
      type: 'file',
      icon: isFolder ? FolderIcon : file.isImage ? ImageIcon : FileIcon,
      description: file.directory,
      path: file.path,
      name: file.name,
      directory: file.directory,
      extension: file.extension,
      size: file.size,
      lastModified: file.lastModified,
      isImage: file.isImage,
      isText: file.isText,
    };
  }

  private cacheFileSuggestions(
    query: string,
    suggestions: SuggestionItem[],
  ): void {
    if (this._fileSuggestionCache.size >= MAX_CACHED_TRIGGER_QUERIES) {
      const oldest = this._fileSuggestionCache.keys().next().value;
      if (oldest !== undefined) this._fileSuggestionCache.delete(oldest);
    }
    this._fileSuggestionCache.set(query, suggestions);
  }

  /**
   * Catalogue prompt suggestions for the `/` dropdown. The typed query
   * filters by label, description, category and text; every entry carries
   * its category label for the "Prompt · <Category>" badge. An empty query
   * lists the whole catalogue.
   */
  private toPromptSuggestionItems(query: string): SuggestionItem[] {
    const needle = query.toLowerCase();
    const prompts: SuggestionItem[] = [];
    for (const category of PROMPT_CATALOGUE) {
      for (const prompt of category.prompts) {
        const matches =
          !needle ||
          prompt.label.toLowerCase().includes(needle) ||
          (prompt.description?.toLowerCase().includes(needle) ?? false) ||
          category.label.toLowerCase().includes(needle) ||
          prompt.text.toLowerCase().includes(needle);
        if (matches) {
          prompts.push({
            type: 'prompt',
            category: category.label,
            ...prompt,
          });
        }
      }
    }
    return prompts;
  }

  private clearTriggerProjectionTimeout(): void {
    if (!this._triggerProjectionTimeout) return;
    clearTimeout(this._triggerProjectionTimeout);
    this._triggerProjectionTimeout = null;
  }

  /** Fetch suggestions for @ trigger (files + folders only). */
  private async fetchAtSuggestions(): Promise<void> {
    this._isFetching.set(true);
    try {
      await this.filePicker.ensureFilesLoaded();
      this._fileSuggestionCache.clear();
      this.refreshSuggestions(this._currentQuery());
    } catch (error) {
      console.error(
        '[ComposerInputController] Failed to fetch @ suggestions:',
        error,
      );
    } finally {
      this._isFetching.set(false);
    }
  }

  /** Fetch suggestions for / trigger (workspace commands). */
  private async fetchCommandSuggestions(): Promise<void> {
    this._isFetching.set(true);
    try {
      await this.commandDiscovery.fetchCommands();
      this._commandSuggestions = null;
      this.refreshSuggestions(this._currentQuery());
    } catch (error) {
      console.error(
        '[ComposerInputController] Failed to fetch / suggestions:',
        error,
      );
    } finally {
      this._isFetching.set(false);
    }
  }

  /** Add a file tag above the textarea (no duplicates). */
  private addFileTag(file: FileSuggestion): void {
    const existingPaths = this.attachments.files().map((f) => f.path);
    if (existingPaths.includes(file.path)) return;

    const chatFile: ChatFile = {
      path: file.path,
      name: file.name,
      size: file.size || 0,
      type: file.isText ? 'text' : 'binary',
      isLarge: (file.size || 0) > 100_000,
      tokenEstimate: Math.ceil((file.size || 0) / 4),
    };

    this.attachments.addFile(chatFile);
  }

  /**
   * Replace the trigger text with the chosen suggestion. False when there is
   * no draft or textarea to write into (nothing was inserted).
   */
  private replaceTrigger(replacement: string): boolean {
    const text = this.text;
    const textarea = this.textareaElement();
    if (!text || !textarea) return false;

    const currentValue = text();
    const triggerStart = this._triggerPosition();
    const cursorPos = textarea.selectionStart;
    const newValue =
      currentValue.substring(0, triggerStart) +
      replacement +
      currentValue.substring(cursorPos);

    text.set(newValue);
    textarea.value = newValue;
    const newCursorPos = triggerStart + replacement.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    return true;
  }

  /** Remove the trigger text (a file becomes a tag instead). */
  private removeTriggerText(): void {
    const text = this.text;
    const textarea = this.textareaElement();
    if (!text || !textarea) return;

    const currentValue = text();
    const triggerStart = this._triggerPosition();
    const cursorPos = textarea.selectionStart;
    const newValue =
      currentValue.substring(0, triggerStart) +
      currentValue.substring(cursorPos);

    text.set(newValue);
    textarea.value = newValue;
    textarea.setSelectionRange(triggerStart, triggerStart);
  }
}

/** Match tier of a command for a `/` query; lower ranks first, `null` is no match. */
function commandMatchTier(
  command: { readonly name: string; readonly description?: string },
  needle: string,
): number | null {
  const name = command.name.toLowerCase();
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (name.includes(needle)) return 2;
  if (command.description?.toLowerCase().includes(needle)) return 3;
  // Fuzzy: the query's characters appear in the name in order.
  let at = 0;
  for (const char of name) if (char === needle[at]) at++;
  return at === needle.length ? 4 : null;
}

/**
 * The commands that match a `/` query, best first: the exact name, then names
 * that start with the query, names that contain it, descriptions that contain
 * it, and last a fuzzy (in-order) match. Ties keep the source order, so
 * `/context` + Enter picks `context`, never an earlier `compact` whose
 * description mentions context (F4). An empty query keeps every command.
 */
export function rankCommandMatches<T extends { readonly name: string; readonly description?: string }>(
  commands: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().replace(/^\//, '').toLowerCase();
  if (!needle) return [...commands];
  return commands
    .map((command, index) => ({ command, index, tier: commandMatchTier(command, needle) }))
    .filter((entry): entry is { command: T; index: number; tier: number } => entry.tier !== null)
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((entry) => entry.command);
}
