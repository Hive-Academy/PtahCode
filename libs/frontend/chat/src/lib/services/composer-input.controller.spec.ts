import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { File } from 'lucide-angular';
import {
  CommandDiscoveryFacade,
  type CommandSuggestion,
} from '@ptah-extension/core';
import {
  ComposerInputController,
  type ComposerCommandSource,
  type ComposerFileMode,
  type ComposerSuggestionsPanel,
} from './composer-input.controller';
import { ComposerAttachmentsService } from './composer-attachments.service';
import { FilePickerService, type FileSuggestion } from './file-picker.service';
import {
  COMPOSER_TRIGGER_CACHE_ENABLED,
  TRIGGER_PROJECTION_DEBOUNCE_MS,
} from './composer-trigger-scheduler';

function command(name: string, description = ''): CommandSuggestion {
  return { name, description, scope: 'builtin', icon: File };
}

const FILE: FileSuggestion = {
  path: '/workspace/src/app.ts',
  name: 'app.ts',
  directory: '/workspace/src',
  type: 'file',
  isImage: false,
  isText: true,
  size: 10,
} as FileSuggestion;

describe('ComposerInputController', () => {
  const remoteResults = signal<FileSuggestion[]>([]);
  const filePicker = {
    searchFiles: jest.fn(() => [FILE]),
    searchFilesRemote: jest.fn(),
    remoteResults,
    fetchError: signal<string | null>(null),
    clearRemoteResults: jest.fn(),
    ensureFilesLoaded: jest.fn().mockResolvedValue(undefined),
  };
  const discovery = {
    searchCommands: jest.fn(() => [command('compact'), command('review')]),
    fetchCommands: jest.fn().mockResolvedValue(undefined),
  };
  const attachments = {
    files: signal<Array<{ path: string }>>([]),
    showError: jest.fn(),
    onPaste: jest.fn(),
    onDrop: jest.fn(),
    addFile: jest.fn(),
  };

  let controller: ComposerInputController;
  let text: ReturnType<typeof signal<string>>;
  let commands: ReturnType<typeof signal<ComposerCommandSource>>;
  let fileMode: ReturnType<typeof signal<ComposerFileMode>>;
  let dropdown: ReturnType<typeof signal<ComposerSuggestionsPanel | undefined>>;
  let textarea: HTMLTextAreaElement;
  let submit: jest.Mock;
  let submitNow: jest.Mock | undefined;

  function setup(
    opts: {
      cache?: boolean;
      prompts?: boolean;
      withSubmitNow?: boolean;
      withoutTextarea?: boolean;
    } = {},
  ): void {
    jest.clearAllMocks();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ComposerInputController,
        { provide: FilePickerService, useValue: filePicker },
        { provide: CommandDiscoveryFacade, useValue: discovery },
        { provide: ComposerAttachmentsService, useValue: attachments },
        { provide: COMPOSER_TRIGGER_CACHE_ENABLED, useValue: opts.cache ?? false },
      ],
    });
    controller = TestBed.inject(ComposerInputController);
    text = signal('');
    commands = signal<ComposerCommandSource>({ state: 'discovery' });
    fileMode = signal<ComposerFileMode>('reference');
    dropdown = signal<ComposerSuggestionsPanel | undefined>(undefined);
    textarea = document.createElement('textarea');
    submit = jest.fn();
    submitNow = opts.withSubmitNow ? jest.fn() : undefined;
    controller.connect({
      text,
      textarea: signal(
        opts.withoutTextarea ? undefined : new ElementRef(textarea),
      ),
      dropdown,
      commands,
      fileMode,
      prompts: opts.prompts ?? true,
      submit,
      submitNow,
    });
  }

  /** Type `value` with the caret at its end. */
  function typeText(value: string): void {
    text.set(value);
    textarea.value = value;
    textarea.setSelectionRange(value.length, value.length);
  }

  beforeEach(() => setup());

  describe('slash suggestions', () => {
    it('lists the discovered commands, then the prompt catalogue', async () => {
      controller.handleSlashActivated({ query: '', cursorPosition: 1 });
      await Promise.resolve();

      expect(discovery.fetchCommands).toHaveBeenCalledTimes(1);
      const items = controller.filteredSuggestions();
      expect(items.slice(0, 2).map((item) => item.type)).toEqual([
        'command',
        'command',
      ]);
      expect(items.some((item) => item.type === 'prompt')).toBe(true);
      expect(controller.suggestionGroups()).toBeNull();
      expect(controller.suggestionNotice()).toBeNull();
    });

    it('leaves the prompt catalogue out when the owner offers none', () => {
      setup({ prompts: false });
      controller.handleSlashActivated({ query: '', cursorPosition: 1 });
      expect(
        controller.filteredSuggestions().every((item) => item.type === 'command'),
      ).toBe(true);
    });

    it('shows one notice row and nothing selectable for an unsupported source', () => {
      commands.set({
        state: 'unsupported',
        reason: 'Codex lanes take no slash commands or skills.',
      });
      controller.handleSlashActivated({ query: '', cursorPosition: 1 });

      expect(discovery.fetchCommands).not.toHaveBeenCalled();
      expect(controller.suggestionNotice()).toBe(
        'Codex lanes take no slash commands or skills.',
      );
      expect(controller.filteredSuggestions()).toEqual([]);
    });

    it('shows the spinner while the source loads, then the groups', () => {
      commands.set({ state: 'loading' });
      controller.handleSlashActivated({ query: '', cursorPosition: 1 });
      expect(controller.isLoadingSuggestions()).toBe(true);

      commands.set({
        state: 'ready',
        groups: [
          { label: 'Commands', commands: [command('review')] },
          {
            label: 'Skills',
            commands: [],
            emptyReason: 'No skills in Codex lanes.',
          },
        ],
      });
      expect(controller.isLoadingSuggestions()).toBe(false);
      const groups = controller.suggestionGroups();
      expect(groups?.map((group) => group.label)).toEqual([
        'Commands',
        'Skills',
        'Prompts',
      ]);
      expect(groups?.[1]?.notice).toBe('No skills in Codex lanes.');
      expect(controller.filteredSuggestions()[0]).toMatchObject({
        type: 'command',
        name: 'review',
      });
      expect(discovery.fetchCommands).not.toHaveBeenCalled();
    });

    it('drops an older list while the source is loading', async () => {
      controller.handleSlashActivated({ query: '', cursorPosition: 1 });
      await Promise.resolve();
      expect(controller.filteredSuggestions().length).toBeGreaterThan(0);

      commands.set({ state: 'loading' });
      expect(controller.isLoadingSuggestions()).toBe(true);
      expect(controller.filteredSuggestions()).toEqual([]);
    });

    it('filters ready groups by the typed query', () => {
      setup({ prompts: false });
      commands.set({
        state: 'ready',
        groups: [
          {
            label: 'Commands',
            commands: [command('review'), command('compact')],
          },
        ],
      });
      controller.handleSlashActivated({ query: '', cursorPosition: 1 });
      controller.handleQueryChanged('rev');
      expect(
        controller.filteredSuggestions().map((item) =>
          item.type === 'command' ? item.name : item.type,
        ),
      ).toEqual(['review']);
    });

    it('replaces the trigger with the chosen command', () => {
      typeText('/rev');
      controller.handleSlashActivated({ query: 'rev', cursorPosition: 4 });
      controller.handleSuggestionSelected({ type: 'command', ...command('review') });

      expect(text()).toBe('/review ');
      expect(controller.showSuggestions()).toBe(false);
    });
  });

  describe('@ files', () => {
    it('adds a file reference and removes the trigger text', () => {
      typeText('see @app');
      controller.handleAtActivated({
        query: 'app',
        cursorPosition: 8,
        triggerPosition: 4,
      });
      const [file] = controller.filteredSuggestions();
      controller.handleSuggestionSelected(file!);

      expect(attachments.addFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: FILE.path }),
      );
      expect(text()).toBe('see ');
      expect(controller.statusNote()).toBeNull();
    });

    it('inserts the path as text with a status note in path-text mode', () => {
      fileMode.set('path-text');
      typeText('see @app');
      controller.handleAtActivated({
        query: 'app',
        cursorPosition: 8,
        triggerPosition: 4,
      });
      const [file] = controller.filteredSuggestions();
      controller.handleSuggestionSelected(file!);
      TestBed.tick();

      expect(attachments.addFile).not.toHaveBeenCalled();
      expect(text()).toBe(`see ${FILE.path} `);
      expect(controller.statusNote()).toContain('as path text');

      text.set('');
      TestBed.tick();
      expect(controller.statusNote()).toBeNull();
    });

    it('sets no path-text note when there is no textarea to insert into', () => {
      setup({ withoutTextarea: true });
      fileMode.set('path-text');
      text.set('see @app');
      controller.handleAtActivated({
        query: 'app',
        cursorPosition: 8,
        triggerPosition: 4,
      });
      const [file] = controller.filteredSuggestions();
      controller.handleSuggestionSelected(file!);
      TestBed.tick();

      expect(text()).toBe('see @app');
      expect(controller.statusNote()).toBeNull();
    });

    it('waits for the projection debounce before searching', () => {
      jest.useFakeTimers();
      try {
        setup({ cache: true });
        controller.handleAtActivated({
          query: '',
          cursorPosition: 1,
          triggerPosition: 0,
        });
        filePicker.searchFiles.mockClear();
        controller.handleQueryChanged('ap');
        controller.handleQueryChanged('app');
        jest.advanceTimersByTime(TRIGGER_PROJECTION_DEBOUNCE_MS - 1);
        expect(filePicker.searchFiles).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(filePicker.searchFiles).toHaveBeenCalledTimes(1);
        expect(filePicker.searchFiles).toHaveBeenCalledWith('app');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('keys', () => {
    const key = (init: KeyboardEventInit): KeyboardEvent =>
      new KeyboardEvent('keydown', { cancelable: true, ...init });

    it('submits on Enter and keeps Shift+Enter for a new line', () => {
      controller.handleKeyDown(key({ key: 'Enter', shiftKey: true }));
      expect(submit).not.toHaveBeenCalled();
      const enter = key({ key: 'Enter' });
      controller.handleKeyDown(enter);
      expect(submit).toHaveBeenCalledTimes(1);
      expect(enter.defaultPrevented).toBe(true);
    });

    it('runs submitNow on Ctrl/Cmd+Enter when the owner offers it', () => {
      setup({ withSubmitNow: true });
      controller.handleKeyDown(key({ key: 'Enter', ctrlKey: true }));
      controller.handleKeyDown(key({ key: 'Enter', metaKey: true }));
      expect(submitNow).toHaveBeenCalledTimes(2);
      expect(submit).not.toHaveBeenCalled();
    });

    it('ignores an Enter that commits IME composition, open dropdown or not', () => {
      controller.handleKeyDown(key({ key: 'Enter', isComposing: true }));
      controller.handleKeyDown(key({ key: 'Enter', keyCode: 229 } as KeyboardEventInit));
      expect(submit).not.toHaveBeenCalled();

      const onKeyDown = jest.fn(() => true);
      dropdown.set({
        listboxId: 'list-1',
        getActiveDescendantId: () => 'suggestion-0',
        onKeyDown,
      } as unknown as ComposerSuggestionsPanel);
      controller.handleSlashActivated({ query: '', cursorPosition: 1 });
      const composing = key({ key: 'Enter', isComposing: true });
      controller.handleKeyDown(composing);
      expect(onKeyDown).not.toHaveBeenCalled();
      expect(composing.defaultPrevented).toBe(false);
    });

    it('submits on Ctrl+Enter when there is no submitNow', () => {
      controller.handleKeyDown(key({ key: 'Enter', ctrlKey: true }));
      expect(submit).toHaveBeenCalledTimes(1);
    });

    it('hands navigation keys to the open dropdown and never submits', () => {
      const onKeyDown = jest.fn(() => true);
      dropdown.set({
        listboxId: 'list-1',
        getActiveDescendantId: () => 'suggestion-0',
        onKeyDown,
      } as unknown as ComposerSuggestionsPanel);
      controller.handleSlashActivated({ query: '', cursorPosition: 1 });

      controller.handleKeyDown(key({ key: 'Enter' }));
      expect(onKeyDown).toHaveBeenCalledTimes(1);
      expect(submit).not.toHaveBeenCalled();
      expect(controller.getListboxId()).toBe('list-1');
      expect(controller.getActiveDescendantId()).toBe('suggestion-0');
    });
  });

  describe('voice and errors', () => {
    it('inserts a transcript at the caret', () => {
      typeText('hello world');
      textarea.setSelectionRange(5, 5);
      controller.insertTranscript(' there');
      expect(text()).toBe('hellothere world');
    });

    it('shows an error through the attachments error line', () => {
      controller.showError('Microphone access denied');
      expect(attachments.showError).toHaveBeenCalledWith(
        'Microphone access denied',
      );
    });
  });
});
