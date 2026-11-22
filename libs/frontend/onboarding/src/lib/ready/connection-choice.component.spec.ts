import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConnectionChoiceComponent } from './connection-choice.component';
import {
  ConnectionChoiceStore,
  type ChoiceNotice,
} from './connection-choice.store';
import {
  CONNECTION_OPTIONS,
  CONNECTION_OPTION_LIST,
  connectionColumns,
  type ConnectionOption,
} from './connection-options';
import type { ProviderKind, SelectionView } from './provider-readiness.derive';

interface Case {
  readonly number: number;
  readonly label: string;
  readonly saved: SelectionView;
  readonly pending?: ProviderKind;
  readonly notice?: ChoiceNotice;
  readonly saving?: boolean;
  readonly writable?: boolean;
  readonly text: string;
  readonly role?: string;
  readonly checked?: ProviderKind | null;
  readonly focus?: 'radio';
}
const cases: readonly Case[] = [
  {
    number: 1,
    label: 'loading',
    saved: { kind: 'loading' },
    text: 'Loading your saved connection',
    checked: null,
  },
  {
    number: 2,
    label: 'loaded unchanged',
    saved: { kind: 'claude-cli' },
    text: 'Claude Code',
    checked: 'claude-cli',
  },
  {
    number: 3,
    label: 'other card selected',
    saved: { kind: 'claude-cli' },
    pending: 'openai-codex',
    text: 'Use Codex as your main connection?',
    role: 'group',
    checked: 'openai-codex',
    focus: 'radio',
  },
  {
    number: 4,
    label: 'write target missing',
    saved: { kind: 'claude-cli' },
    pending: 'openai-codex',
    writable: false,
    text: 'Where to save is not loaded yet',
    role: 'status',
    checked: 'openai-codex',
  },
  {
    number: 5,
    label: 'saving',
    saved: { kind: 'claude-cli' },
    pending: 'openai-codex',
    saving: true,
    text: 'Saving your main connection...',
    role: 'status',
    checked: 'openai-codex',
  },
  {
    number: 6,
    label: 'saved reread ok',
    saved: { kind: 'openai-codex' },
    pending: 'openai-codex',
    notice: 6,
    text: 'Saved. Codex is your main connection.',
    checked: 'openai-codex',
    focus: 'radio',
  },
  {
    number: 7,
    label: 'saved refresh failed',
    saved: { kind: 'openai-codex' },
    pending: 'openai-codex',
    notice: 7,
    text: 'Some settings could not be refreshed',
    checked: 'openai-codex',
    focus: 'radio',
  },
  {
    number: 8,
    label: 'save returned false',
    saved: { kind: 'claude-cli' },
    pending: 'openai-codex',
    notice: 8,
    text: 'Another save is in progress',
    checked: 'claude-cli',
    focus: 'radio',
  },
  {
    number: 9,
    label: 'blocked failed or partial',
    saved: { kind: 'claude-cli' },
    pending: 'openai-codex',
    notice: 9,
    text: 'Not saved.',
    role: 'alert',
    checked: 'claude-cli',
    focus: 'radio',
  },
  {
    number: 10,
    label: 'unconfirmed',
    saved: { kind: 'claude-cli' },
    pending: 'openai-codex',
    notice: 10,
    text: 'Ptah could not confirm the change',
    role: 'alert',
    checked: 'claude-cli',
    focus: 'radio',
  },
  {
    number: 11,
    label: 'saved status not confirmed',
    saved: { kind: 'not-confirmed' },
    pending: 'openai-codex',
    notice: 11,
    text: 'Saved, status not confirmed',
    role: 'alert',
    checked: null,
    focus: 'radio',
  },
  {
    number: 12,
    label: 'cannot read saved connection',
    saved: { kind: 'unreadable' },
    text: 'Ptah could not read your saved connection',
    role: 'alert',
    checked: null,
  },
  {
    number: 13,
    label: 'other connection saved',
    saved: { kind: 'other', name: 'OpenRouter' },
    text: 'You can manage OpenRouter in Providers',
    checked: null,
  },
];

describe('ConnectionChoiceComponent design states 1–13', () => {
  it.each(cases)('state $number: $label', async (scenario) => {
    const saved = signal<SelectionView>(
      scenario.number === 6 || scenario.number === 7
        ? { kind: 'claude-cli' }
        : scenario.saved,
    );
    const pending = signal<ProviderKind | null>(
      scenario.number === 3 ? null : (scenario.pending ?? null),
    );
    const phase = signal<'idle' | 'saving'>(
      scenario.saving ? 'saving' : 'idle',
    );
    const notice = signal<ChoiceNotice>(
      scenario.number >= 6 && scenario.number <= 11
        ? null
        : (scenario.notice ?? null),
    );
    const writable = signal(scenario.writable !== false);
    const store = {
      saved,
      pending,
      phase,
      notice,
      changed: computed(() => pending() !== null && pending() !== saved().kind),
      canConfirm: computed(() => writable()),
      target: computed(() => (writable() ? 'workspace' : null)),
      name: () =>
        saved().kind === 'openai-codex'
          ? 'Codex'
          : saved().kind === 'other'
            ? 'OpenRouter'
            : 'Claude Code',
      nameForPending: () =>
        pending() === 'openai-codex' ? 'Codex' : 'Claude Code',
      choose: (provider: ProviderKind) => pending.set(provider),
      cancel: () => pending.set(null),
      confirm: jest.fn<Promise<void>, []>(async () => {
        pending.set(null);
        saved.set(scenario.saved);
        notice.set(scenario.notice ?? null);
      }),
      retry: jest.fn<Promise<void>, []>(async () => undefined),
    };
    TestBed.configureTestingModule({
      imports: [ConnectionChoiceComponent],
      providers: [
        provideRouter([]),
        { provide: CONNECTION_OPTION_LIST, useValue: signal(CONNECTION_OPTIONS) },
        { provide: ConnectionChoiceStore, useValue: store },
      ],
    });
    const fixture = TestBed.createComponent(ConnectionChoiceComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    if (scenario.number === 3) {
      const radio = element.querySelector<HTMLInputElement>(
        'input[value="openai-codex"]',
      );
      radio?.focus();
      radio?.click();
      fixture.detectChanges();
    }
    if (scenario.number >= 6 && scenario.number <= 11) {
      (
        element.querySelector('button.btn-primary') as HTMLButtonElement
      ).click();
      await Promise.resolve();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }
    expect(element.textContent).toContain(scenario.text);
    if (scenario.role)
      expect(element.querySelector(`[role="${scenario.role}"]`)).not.toBeNull();
    if (scenario.number === 1)
      expect(element.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    else
      expect(element.querySelectorAll('input[type="radio"]')).toHaveLength(
        CONNECTION_OPTIONS.length,
      );
    const checked = element.querySelector<HTMLInputElement>(
      'input[type="radio"]:checked',
    );
    expect(checked?.value ?? null).toBe(scenario.checked ?? null);
    if (scenario.number === 2)
      expect(
        element.querySelector('[aria-label="Confirm main connection change"]'),
      ).toBeNull();
    if (scenario.number === 4)
      expect(
        element
          .querySelector('button.btn-primary')
          ?.getAttribute('aria-disabled'),
      ).toBe('true');
    if (scenario.number === 5)
      expect(element.querySelectorAll('input:disabled')).toHaveLength(
        CONNECTION_OPTIONS.length,
      );
    if (scenario.number === 11)
      expect(element.querySelectorAll('[role="alert"]')).toHaveLength(1);
    if (scenario.number === 12) {
      store.retry.mockImplementation(async () => {
        saved.set({ kind: 'claude-cli' });
        notice.set(null);
      });
      (
        element.querySelector('button.btn-secondary') as HTMLButtonElement
      ).click();
      await Promise.resolve();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(document.activeElement).toBe(
        element.querySelector('input[value="claude-cli"]'),
      );
    }
    if (scenario.focus === 'radio') {
      const radio =
        element.querySelector<HTMLInputElement>(
          'input[type="radio"]:checked',
        ) ?? element.querySelector<HTMLInputElement>('input[type="radio"]');
      expect(document.activeElement).toBe(radio);
    }
  });
});

describe('ConnectionChoiceComponent option list', () => {
  function render(
    saved: SelectionView,
    options?: readonly ConnectionOption[],
  ): HTMLElement {
    const savedSignal = signal(saved);
    const pending = signal<ProviderKind | null>(null);
    TestBed.configureTestingModule({
      imports: [ConnectionChoiceComponent],
      providers: [
        provideRouter([]),
        {
          provide: CONNECTION_OPTION_LIST,
          useValue: signal(options ?? CONNECTION_OPTIONS),
        },
        {
          provide: ConnectionChoiceStore,
          useValue: {
            saved: savedSignal,
            pending,
            phase: signal('idle'),
            notice: signal<ChoiceNotice>(null),
            changed: computed(() => false),
            canConfirm: computed(() => true),
            target: computed(() => 'workspace'),
            name: () => 'OpenRouter',
            nameForPending: () => 'Claude Code',
            choose: (provider: ProviderKind) => pending.set(provider),
            cancel: () => pending.set(null),
            confirm: jest.fn(),
            retry: jest.fn(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ConnectionChoiceComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const cards = (element: HTMLElement) => [
    ...element.querySelectorAll<HTMLLabelElement>(
      '[data-testid="connection-choice-cards"] label',
    ),
  ];
  afterEach(() => TestBed.resetTestingModule());

  it('renders one radio card per option, in list order, with its name and description', () => {
    const element = render({ kind: 'claude-cli' });
    const labels = cards(element);
    expect(labels.map((card) => card.querySelector('input')?.value)).toEqual(
      CONNECTION_OPTIONS.map((option) => option.id),
    );
    labels.forEach((card, index) => {
      const option = CONNECTION_OPTIONS[index];
      const name = card.querySelector('[data-testid="connection-option-name"]');
      expect(name?.textContent?.trim()).toBe(option.name);
      expect(
        card
          .querySelector('[data-testid="connection-option-description"]')
          ?.textContent?.trim(),
      ).toBe(option.description);
      // Inside a label the name is plain text, not a heading.
      expect(name?.getAttribute('role')).toBeNull();
    });
  });

  it('marks the saved option as the main connection and the others as not', () => {
    const element = render({ kind: 'openai-codex' });
    const roles = cards(element).map((card) => ({
      id: card.querySelector('input')?.value,
      role: card
        .querySelector('[data-testid="connection-option-role"]')
        ?.textContent?.trim(),
    }));
    expect(roles).toEqual(
      CONNECTION_OPTIONS.map((option) => ({
        id: option.id,
        role:
          option.id === 'openai-codex'
            ? 'Main connection'
            : 'Not your main connection',
      })),
    );
  });

  it('shows no role badge while no option is the saved connection', () => {
    const element = render({ kind: 'other', name: 'OpenRouter' });
    expect(
      element.querySelectorAll('[data-testid="connection-option-role"]'),
    ).toHaveLength(0);
    expect(element.textContent).toContain('Your main connection is OpenRouter');
  });

  it('renders one loading placeholder per option', () => {
    const element = render({ kind: 'loading' });
    expect(
      element.querySelectorAll('[role="status"] .animate-pulse'),
    ).toHaveLength(CONNECTION_OPTIONS.length);
  });

  it('sets one grid column per option, so three options render three columns', () => {
    // Test-only third descriptor; the real list stays at two.
    const third: ConnectionOption = {
      ...CONNECTION_OPTIONS[1],
      id: 'test-third' as ProviderKind,
      name: 'Third agent',
      description: 'A test-only coding agent',
      panelTestId: 'ready-test-third-panel',
    };
    const element = render({ kind: 'claude-cli' }, [...CONNECTION_OPTIONS, third]);
    const grid = element.querySelector<HTMLElement>(
      '[data-testid="connection-choice-cards"]',
    );
    expect(grid?.style.getPropertyValue('--connection-cols')).toBe('3');
    expect(grid?.className).toContain(
      'lg:grid-cols-[repeat(var(--connection-cols),minmax(0,1fr))]',
    );
    expect(grid?.className).toContain('grid-cols-1');
    expect(cards(element).map((card) => card.querySelector('input')?.value)).toEqual(
      ['claude-cli', 'openai-codex', 'test-third'],
    );
    expect(
      cards(element)[2].querySelector('[data-testid="connection-option-name"]')
        ?.textContent?.trim(),
    ).toBe('Third agent');
  });

  it('caps the columns at three and never drops below one', () => {
    expect([0, 1, 2, 3, 4, 6].map(connectionColumns)).toEqual([1, 1, 2, 3, 3, 3]);
  });

  it('the real list renders two columns', () => {
    const grid = render({ kind: 'claude-cli' }).querySelector<HTMLElement>(
      '[data-testid="connection-choice-cards"]',
    );
    expect(grid?.style.getPropertyValue('--connection-cols')).toBe(
      String(CONNECTION_OPTIONS.length),
    );
  });
});
