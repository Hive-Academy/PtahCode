import { By } from '@angular/platform-browser';
import { PtahRichSelectComponent } from '@ptah-extension/ui';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ProvidersSettingsStateService,
  VSCodeService,
} from '@ptah-extension/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  SESSION_BUDGET_SETTINGS,
  type SessionBudgetConfig,
  type SessionBudgetNumberSetting,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { SessionBudgetSettingsComponent } from './session-budget-settings.component';

const mockRpcCall = jest.fn();
jest.mock('@ptah-extension/core', () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    '@ptah-extension/core',
  );
  return {
    ...actual,
    rpcCall: (...args: unknown[]) => mockRpcCall(...args),
  };
});

type Key = keyof SessionBudgetConfig;
type RpcReply = { success: boolean; data?: unknown; error?: string };

const DEFAULTS: Record<string, unknown> = Object.fromEntries(
  Object.values(SESSION_BUDGET_SETTINGS).map((setting) => [
    setting.key,
    setting.default,
  ]),
);

const NUMBER_KEYS = (Object.keys(SESSION_BUDGET_SETTINGS) as Key[]).filter(
  (key) => SESSION_BUDGET_SETTINGS[key].kind === 'number',
);

describe('SessionBudgetSettingsComponent', () => {
  let fixture: ComponentFixture<SessionBudgetSettingsComponent>;
  let stored: Record<string, unknown>;
  let readFails: boolean;
  let writeReply: () => Promise<RpcReply>;
  const tabManager = { clearSessionBudgets: jest.fn() };

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const byTestId = <T extends HTMLElement = HTMLElement>(
    id: string,
  ): T | null => host().querySelector<T>(`[data-testid="${id}"]`);
  const field = (key: Key): HTMLInputElement =>
    byTestId<HTMLInputElement>(`session-budget-${key}`) as HTMLInputElement;
  const rich = (key: string) => fixture.debugElement.query(By.css(`[data-testid="session-budget-${key}"]`)).componentInstance as PtahRichSelectComponent<string>;
  const choose = (key: string, value: string) => fixture.debugElement.query(By.css(`[data-testid="session-budget-${key}"]`)).triggerEventHandler('valueChange', value);
  const writes = (): Array<{ key: string; value: unknown }> =>
    mockRpcCall.mock.calls
      .filter((call) => call[1] === 'settings:set')
      .map((call) => call[2] as { key: string; value: unknown });
  const settle = async (): Promise<void> => {
    // Zoneless stability does not track the mocked RPC promise chain.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(SessionBudgetSettingsComponent);
    fixture.detectChanges();
    await settle();
  }

  it('connects each checkbox to its row label and resolves every description', async () => {
    await create();
    for (const checkbox of host().querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )) {
      expect(checkbox.id).toBeTruthy();
      expect(
        host().querySelector(`label[for="${checkbox.id}"]`),
      ).not.toBeNull();
    }
    for (const control of host().querySelectorAll<HTMLElement>(
      '[aria-describedby]',
    )) {
      for (const id of (control.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(Boolean)) {
        expect(host().querySelector(`[id="${id}"]`)).not.toBeNull();
      }
    }
    await enter('tokens', 'bad');
    for (const control of host().querySelectorAll<HTMLElement>(
      '[aria-describedby]',
    )) {
      for (const id of (control.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(Boolean)) {
        expect(host().querySelector(`[id="${id}"]`)).not.toBeNull();
      }
    }
  });

  /** Types into a number field, then commits it (blur / Enter fire `change`). */
  async function enter(key: Key, text: string): Promise<void> {
    const input = field(key);
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    stored = { ...DEFAULTS };
    readFails = false;
    writeReply = async () => ({ success: true, data: { success: true } });
    mockRpcCall.mockImplementation(
      async (
        _vscode: unknown,
        method: string,
        params: { key: string; value?: unknown },
      ): Promise<RpcReply> => {
        if (method === 'settings:get') {
          return readFails
            ? { success: false, error: 'unreadable' }
            : {
                success: true,
                data: { success: true, value: stored[params.key] },
              };
        }
        const reply = await writeReply();
        if (reply.success && (reply.data as { success?: boolean })?.success) {
          stored[params.key] = params.value;
        }
        return reply;
      },
    );
    TestBed.configureTestingModule({
      imports: [SessionBudgetSettingsComponent],
      providers: [
        { provide: VSCodeService, useValue: {} },
        { provide: TabManagerService, useValue: tabManager },
        {
          provide: ProvidersSettingsStateService,
          useValue: { commit: signal({ status: 'idle' }) },
        },
        SettingsSaveFeedbackService,
      ],
    });
  });

  const toast = () => TestBed.inject(SettingsSaveFeedbackService).toast();

  afterEach(() => {
    TestBed.inject(SettingsSaveFeedbackService).dismiss();
    fixture?.destroy();
  });

  it('keeps labeled numeric rows and unit suffixes', async () => {
    await create();
    for (const key of NUMBER_KEYS) {
      const control = field(key);
      const row = control.closest('ptah-field');
      expect(row).not.toBeNull();
      expect(row?.querySelector('label')?.getAttribute('for')).toBe(control.id);
      expect(control.getAttribute('data-ptah-control')).toBe('input');
      expect(control.closest('ptah-field')).not.toBeNull();
      expect(
        row?.querySelector('[aria-hidden="true"]')?.textContent?.trim(),
      ).toBeTruthy();
    }
  });

  it('uses floating labels and rich selects in one shared field grid', async () => {
    await create();
    const grid = host().querySelector('.session-budget-fields');
    expect(grid).not.toBeNull();
    const fields = host().querySelectorAll('.ptah-field[data-appearance]');
    expect(fields).toHaveLength(NUMBER_KEYS.length + 2);
    for (const field of fields) {
      expect(field.getAttribute('data-appearance')).toBe('floating');
      expect(field.closest('.session-budget-fields')).toBe(grid);
    }
  });

  it('explains the measures and the compaction count gate', async () => {
    await create();
    expect(
      byTestId('session-budget-token-measure-resolved')?.textContent,
    ).toContain('Weighted session tokens');
    expect(host().textContent).toContain(
      'Weighted discounts cache reads',
    );
    expect(host().textContent).toContain(
      'raw counts all tokens',
    );
    expect(host().textContent).toContain(
      'context at least half full',
    );
  });

  it('keeps weighted for a stored budget with no stored measure', async () => {
    delete stored['sessionBudget.tokenMeasure'];
    stored['sessionBudget.tokens'] = 30_000_000;
    await create();
    expect(
      rich('token-measure').value(),
    ).toBe('weighted');
    expect(byTestId('session-budget-token-measure-recommendation')).toBeNull();
  });

  it('shows a migrated raw budget and switches measure without changing its number', async () => {
    stored['sessionBudget.tokenMeasure'] = 'raw';
    stored['sessionBudget.tokens'] = 30_000_000;
    await create();
    expect(
      rich('token-measure').value(),
    ).toBe('raw');
    expect(
      byTestId('session-budget-token-measure-resolved')?.textContent,
    ).toContain('Raw session tokens');
    expect(
      byTestId('session-budget-token-measure-recommendation'),
    ).not.toBeNull();
    byTestId<HTMLButtonElement>('session-budget-token-measure-switch')?.click();
    await settle();
    expect(writes()).toEqual([
      { key: 'sessionBudget.tokenMeasure', value: 'weighted' },
    ]);
    expect(stored['sessionBudget.tokens']).toBe(30_000_000);
    expect(byTestId('session-budget-token-measure-recommendation')).toBeNull();
  });

  it('saves the selected raw measure and lets the recommendation be dismissed', async () => {
    await create();
    choose('token-measure', 'raw');
    await settle();
    expect(writes()).toEqual([
      { key: 'sessionBudget.tokenMeasure', value: 'raw' },
    ]);
    expect(
      byTestId('session-budget-token-measure-recommendation'),
    ).not.toBeNull();
    byTestId('session-budget-token-measure-recommendation')
      ?.querySelectorAll('button')[1]
      ?.click();
    fixture.detectChanges();
    expect(byTestId('session-budget-token-measure-recommendation')).toBeNull();
  });

  it('marks invalid numeric input and keeps its error', async () => {
    await create();
    await enter('tokens', 'bad');
    expect(field('tokens').getAttribute('aria-invalid')).toBe('true');
    expect(byTestId('session-budget-tokens-error')?.textContent).toContain(
      'Enter a number.',
    );
  });

  it('keeps the stored-value notice associated with the input', async () => {
    stored['sessionBudget.tokens'] = 5;
    await create();
    expect(field('tokens').getAttribute('aria-describedby')).toContain(
      'session-budget-tokens-stored',
    );
    expect(byTestId('session-budget-tokens-stored')).not.toBeNull();
  });

  it('omits the readable note when none is available', async () => {
    await create();
    const row = field('usd').closest('ptah-field');
    expect(
      row?.querySelector('span.whitespace-nowrap.text-xs:not([aria-hidden])'),
    ).toBeNull();
  });

  it('keeps number help behind info actions and only ranges below the fields', async () => {
    await create();
    const fields = [
      {
        key: 'tokens',
        label: 'Token budget',
        help: 'Chat token limit.',
      },
      {
        key: 'usd',
        label: 'Cost budget (USD)',
        help: 'Session cost limit.',
      },
      {
        key: 'fallbackWeightedTokens',
        label: 'Fallback weighted tokens',
        help: 'Used when model pricing is unavailable.',
      },
      {
        key: 'tightenPercent',
        label: 'Tighten at (%)',
        help: 'Starts tightening; stays below Handoff.',
      },
      {
        key: 'handoffPercent',
        label: 'Handoff at (%)',
        help: 'Offers to wrap up and hand off to a new session.',
      },
      {
        key: 'handoffAfterCompactions',
        label: 'Handoff after compactions',
        help: 'Handoff after repeated compactions leave context at least half full.',
      },
      {
        key: 'tightenWindowTokens',
        label: 'Tighten auto-compact window (tokens)',
        help: 'Advisory only until set; then lowers the compact window.',
      },
    ] as const;
    for (const setting of fields) {
      const row = field(setting.key).closest('ptah-field');
      expect(row?.querySelector(`button[aria-label="More about ${setting.label}"]`)).not.toBeNull();
      const info = row?.querySelector<HTMLElement>('.sr-only[id^="ptah-field-info-"]');
      expect(info?.textContent).toBe(setting.help);
      expect(field(setting.key).getAttribute('aria-describedby')?.split(' ')).toContain(info?.id);
      expect(row?.querySelector('.ptah-field__message')?.textContent?.trim()).toBe(`Range: ${SESSION_BUDGET_SETTINGS[setting.key].min.toLocaleString('en-US')} to ${SESSION_BUDGET_SETTINGS[setting.key].max.toLocaleString('en-US')}.`);
      const suffix = row?.querySelector('[ptahFieldTrailing]');
      expect(suffix?.classList.contains('shrink-0')).toBe(true);
      expect(suffix?.getAttribute('aria-hidden')).toBe('true');
    }
    for (const label of ['Budget unit', 'Token measure']) {
      const row = host().querySelector(`button[aria-label="More about ${label}"]`)?.closest('ptah-field');
      expect(row).toBeDefined();
      expect(row?.querySelector('.ptah-field__message')).toBeNull();
      expect(row?.querySelector('.sr-only[id^="ptah-field-info-"]')?.textContent).toBe(
        label === 'Budget unit' ? 'Tokens use chat usage; Cost uses priced models.' : 'Weighted discounts cache reads; raw counts all tokens.',
      );
    }
  });

  describe('load', () => {
    it('reads all sessionBudget keys and shows the saved values (TOKENS, 50M default)', async () => {
      await create();
      expect(
        (fixture.nativeElement as HTMLElement)
          .querySelector('ptah-form-section')
          ?.getAttribute('data-glass-surface'),
      ).toBe('content');
      const read = mockRpcCall.mock.calls
        .filter((call) => call[1] === 'settings:get')
        .map((call) => (call[2] as { key: string }).key)
        .sort();
      expect(read).toEqual(
        Object.values(SESSION_BUDGET_SETTINGS)
          .map((setting) => setting.key)
          .sort(),
      );
      expect(read).toHaveLength(Object.keys(SESSION_BUDGET_SETTINGS).length);
      expect(field('tokens').value).toBe('50000000');
      expect(field('tokens').className).toContain('input-sm');
      expect(field('tokens').hasAttribute('size')).toBe(false);
      expect(field('tokens').className).not.toContain('flex-1');
      expect(field('tokens').className).not.toContain('join-item');
      expect(field('tokens').classList.contains('tabular-nums')).toBe(true);
      expect(host().textContent).toContain('Range: 1,000,000 to 2,000,000,000');
      expect(field('tightenPercent').value).toBe('50');
      expect(field('handoffPercent').value).toBe('80');
      expect(field('tightenWindowTokens').value).toBe('');
      expect(rich('unit').value()).toBe(
        'tokens',
      );
      expect(field('enabled').checked).toBe(true);
      expect(field('enabled').className).toContain('toggle-sm');
      expect(writes()).toEqual([]);
    });

    it('bounds each settings read so an unanswered host RPC reaches the Retry state', async () => {
      await create();
      const readTimeouts = mockRpcCall.mock.calls
        .filter((call) => call[1] === 'settings:get')
        .map((call) => call[3]);
      expect(readTimeouts).toEqual(
        Array(Object.keys(SESSION_BUDGET_SETTINGS).length).fill(5_000),
      );
    });

    it('shows a load error with Retry when a read fails, and Retry reads again', async () => {
      readFails = true;
      await create();
      expect(byTestId('session-budget-load-error')).not.toBeNull();
      expect(byTestId('session-budget-tokens')).toBeNull();

      readFails = false;
      byTestId<HTMLButtonElement>('session-budget-retry')?.click();
      await settle();
      expect(byTestId('session-budget-load-error')).toBeNull();
      expect(field('tokens').value).toBe('50000000');
    });

    it('says when a hand-edited stored value is out of bounds and the default applies', async () => {
      stored['sessionBudget.tokens'] = 5;
      await create();
      expect(byTestId('session-budget-tokens-stored')?.textContent).toContain(
        'Ptah uses the default (50,000,000)',
      );
    });
  });

  describe('bounds (SESSION_BUDGET_SETTINGS)', () => {
    it.each(NUMBER_KEYS)(
      '%s: below min and above max show an inline error and are not written',
      async (key) => {
        await create();
        const setting = SESSION_BUDGET_SETTINGS[
          key
        ] as SessionBudgetNumberSetting;
        const step = setting.integer ? 1 : 0.01;

        await enter(key, String(setting.min - step));
        expect(field(key).getAttribute('aria-invalid')).toBe('true');
        expect(byTestId(`session-budget-${key}-error`)?.textContent).toContain(
          'Enter a value from',
        );

        await enter(key, String(setting.max + step));
        expect(byTestId(`session-budget-${key}-error`)?.textContent).toContain(
          'Enter a value from',
        );
        expect(writes()).toEqual([]);
      },
    );

    // Handoff's minimum (20) is below the saved tighten (50), so its in-range edge here is the maximum.
    it.each(NUMBER_KEYS)(
      '%s: an in-range edge value is written',
      async (key) => {
        await create();
        const setting = SESSION_BUDGET_SETTINGS[
          key
        ] as SessionBudgetNumberSetting;
        const value = key === 'handoffPercent' ? setting.max : setting.min;
        await enter(key, String(value));
        expect(byTestId(`session-budget-${key}-error`)).toBeNull();
        expect(writes()).toEqual([{ key: setting.key, value }]);
      },
    );

    it('rejects fractions for whole-number settings and text for any', async () => {
      await create();
      await enter('handoffAfterCompactions', '2.5');
      expect(
        byTestId('session-budget-handoffAfterCompactions-error')?.textContent,
      ).toContain('whole number');
      await enter('usd', 'ten');
      expect(byTestId('session-budget-usd-error')?.textContent).toContain(
        'Enter a number',
      );
      expect(writes()).toEqual([]);
    });

    it('accepts grouped digits and writes the number', async () => {
      await create();
      await enter('tokens', '20,000,000');
      expect(writes()).toEqual([
        { key: 'sessionBudget.tokens', value: 20_000_000 },
      ]);
      expect(field('tokens').value).toBe('20000000');
    });

    it('a required field cannot be emptied', async () => {
      await create();
      await enter('tokens', '');
      expect(byTestId('session-budget-tokens-error')?.textContent).toContain(
        'Enter a value',
      );
      expect(writes()).toEqual([]);
    });
  });

  describe('tighten < handoff (isSessionBudgetPercentOrderValid)', () => {
    it('refuses a tighten percent at or above the saved handoff percent', async () => {
      await create();
      await enter('tightenPercent', '80');
      expect(
        byTestId('session-budget-tightenPercent-error')?.textContent,
      ).toContain('below Handoff at (80%)');
      expect(writes()).toEqual([]);
    });

    it('refuses a handoff percent at or below the saved tighten percent', async () => {
      await create();
      await enter('handoffPercent', '50');
      expect(
        byTestId('session-budget-handoffPercent-error')?.textContent,
      ).toContain('above Tighten at (50%)');
      expect(writes()).toEqual([]);
    });

    it('checks against the newly saved partner value', async () => {
      await create();
      await enter('handoffPercent', '95');
      await enter('tightenPercent', '90');
      expect(writes()).toEqual([
        { key: 'sessionBudget.handoffPercent', value: 95 },
        { key: 'sessionBudget.tightenPercent', value: 90 },
      ]);
    });

    it('revalidates and saves a pending tighten draft after its handoff partner changes', async () => {
      await create();
      await enter('tightenPercent', '85');
      expect(byTestId('session-budget-tightenPercent-error')).not.toBeNull();

      await enter('handoffPercent', '95');

      expect(byTestId('session-budget-tightenPercent-error')).toBeNull();
      expect(writes()).toEqual([
        { key: 'sessionBudget.handoffPercent', value: 95 },
        { key: 'sessionBudget.tightenPercent', value: 85 },
      ]);
    });

    it('does not save a partner draft the user is still typing in (focused), only re-validates it', async () => {
      await create();
      await enter('tightenPercent', '85');
      expect(byTestId('session-budget-tightenPercent-error')).not.toBeNull();

      // Handoff commits while focus has already moved into the tighten field.
      const handoff = field('handoffPercent');
      handoff.value = '95';
      handoff.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      handoff.dispatchEvent(new Event('change'));
      handoff.dispatchEvent(new FocusEvent('blur'));
      field('tightenPercent').dispatchEvent(new FocusEvent('focus'));
      await settle();

      expect(writes()).toEqual([
        { key: 'sessionBudget.handoffPercent', value: 95 },
      ]);
      expect(byTestId('session-budget-tightenPercent-error')).toBeNull();
      expect(field('tightenPercent').value).toBe('85');

      // Its own blur / Enter then saves it.
      field('tightenPercent').dispatchEvent(new Event('change'));
      await settle();
      expect(writes()).toEqual([
        { key: 'sessionBudget.handoffPercent', value: 95 },
        { key: 'sessionBudget.tightenPercent', value: 85 },
      ]);
    });

    it('Tab after editing both: leaving the focused partner without typing saves its now-valid draft', async () => {
      await create();
      await enter('tightenPercent', '85');
      expect(byTestId('session-budget-tightenPercent-error')).not.toBeNull();

      // Handoff is edited, then Tab moves focus into tighten while the handoff write is in flight.
      const handoff = field('handoffPercent');
      handoff.value = '95';
      handoff.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      handoff.dispatchEvent(new Event('change'));
      handoff.dispatchEvent(new FocusEvent('blur'));
      const tighten = field('tightenPercent');
      tighten.dispatchEvent(new FocusEvent('focus'));
      await settle();
      expect(writes()).toEqual([
        { key: 'sessionBudget.handoffPercent', value: 95 },
      ]);

      // Tab again with no keystroke: no `change` fires, only `blur`.
      tighten.dispatchEvent(new FocusEvent('blur'));
      await settle();

      expect(writes()).toEqual([
        { key: 'sessionBudget.handoffPercent', value: 95 },
        { key: 'sessionBudget.tightenPercent', value: 85 },
      ]);
      expect(byTestId('session-budget-tightenPercent-error')).toBeNull();
      expect(field('tightenPercent').value).toBe('85');
    });

    it('leaving a field whose `change` already saved it does not write it twice', async () => {
      await create();
      const tokens = field('tokens');
      tokens.dispatchEvent(new FocusEvent('focus'));
      await enter('tokens', '2000000');
      tokens.dispatchEvent(new FocusEvent('blur'));
      await settle();
      expect(writes()).toEqual([
        { key: 'sessionBudget.tokens', value: 2_000_000 },
      ]);
    });
  });

  describe('tightenWindowTokens', () => {
    it('explains "advisory only until set", and an empty field writes null', async () => {
      stored['sessionBudget.tightenWindowTokens'] = 400_000;
      await create();
      expect(
        host().querySelector(
          '#' +
            field('tightenWindowTokens')
              .getAttribute('aria-describedby')
              ?.split(' ')
              .find((id) => id.startsWith('ptah-field-info-')),
        )?.textContent,
      ).toMatch(/advisory only until set/i);
      await enter('tightenWindowTokens', '');
      expect(writes()).toEqual([
        { key: 'sessionBudget.tightenWindowTokens', value: null },
      ]);
    });
  });

  describe('failed write', () => {
    it('a refused write keeps the saved value, keeps the typed text and says so', async () => {
      writeReply = async () => ({
        success: true,
        data: { success: false, error: 'disk full' },
      });
      await create();
      await enter('tokens', '2000000');
      expect(byTestId('session-budget-tokens-error')).toBeNull();
      expect(byTestId('session-budget-status')).toBeNull();
      expect(toast()).toEqual({
        tone: 'alert',
        message: 'Could not save Token budget. The saved setting is unchanged.',
        canUndo: false,
      });
      expect(field('tokens').value).toBe('2000000');
      expect(stored['sessionBudget.tokens']).toBe(50_000_000);
    });

    it('bounds each settings write with a timeout', async () => {
      await create();
      await enter('tokens', '2000000');
      const writeTimeouts = mockRpcCall.mock.calls
        .filter((call) => call[1] === 'settings:set')
        .map((call) => call[3]);
      expect(writeTimeouts).toEqual([5_000]);
    });

    it('a timed-out write frees the card and says the save is unconfirmed', async () => {
      writeReply = async () => ({
        success: false,
        error: 'RPC timeout: settings:set',
      });
      await create();
      await enter('tokens', '2000000');
      expect(toast()?.tone).toBe('alert');
      expect(toast()?.message).toContain(
        'Could not confirm saving Token budget',
      );
      expect(field('tokens').getAttribute('aria-disabled')).toBeNull();
      expect(field('tokens').value).toBe('2000000');

      // Not busy: the next edit is written.
      writeReply = async () => ({ success: true, data: { success: true } });
      await enter('tokens', '3000000');
      expect(writes()).toEqual([
        { key: 'sessionBudget.tokens', value: 2_000_000 },
        { key: 'sessionBudget.tokens', value: 3_000_000 },
      ]);
      expect(byTestId('session-budget-tokens-error')).toBeNull();
    });

    it('a transport failure on a toggle leaves the box at the saved value', async () => {
      writeReply = async () => {
        throw new Error('timeout');
      };
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {
        /* expected */
      });
      try {
        await create();
        const box = field('enabled');
        box.checked = false;
        box.dispatchEvent(new Event('change'));
        await settle();
        expect(box.checked).toBe(true);
        expect(toast()?.tone).toBe('alert');
        expect(toast()?.message).toContain('Could not save');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('SessionBudgetSettings:'),
          'settings:set failed',
          new Error('timeout'),
        );
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('toggles and unit', () => {
    it('writes a toggle and shows the read-back value', async () => {
      await create();
      const box = field('enabled');
      box.checked = false;
      box.dispatchEvent(new Event('change'));
      await settle();
      expect(writes()).toEqual([
        { key: 'sessionBudget.enabled', value: false },
      ]);
      expect(box.checked).toBe(false);
      expect(toast()?.tone).toBe('status');
      expect(toast()?.message).toContain('Saved');
      expect(toast()?.canUndo).toBe(true);
      await TestBed.inject(SettingsSaveFeedbackService).undo();
      await settle();
      expect(writes()).toEqual([
        { key: 'sessionBudget.enabled', value: false },
        { key: 'sessionBudget.enabled', value: true },
      ]);
      expect(box.checked).toBe(true);
    });

    it('writes "Hand off automatically at 100%" (on by default) and keeps the banners', async () => {
      await create();
      const box = field('autoHandoffAtLimit');
      expect(box.checked).toBe(true);
      expect(
        host()
          .querySelector('label[for="session-budget-autoHandoffAtLimit"]')
          ?.textContent?.trim(),
      ).toBe('Hand off automatically at 100%');
      expect(
        byTestId('settings-section-session-budget')?.textContent,
      ).toContain('once per session');
      box.checked = false;
      box.dispatchEvent(new Event('change'));
      await settle();
      expect(writes()).toEqual([
        { key: 'sessionBudget.autoHandoffAtLimit', value: false },
      ]);
      expect(box.checked).toBe(false);
      expect(tabManager.clearSessionBudgets).not.toHaveBeenCalled();
    });

    // TASK_2026_614 F.4 / F-D: turning the budget off clears every tab's banner.
    it('clears the budget on every tab once "enabled" is saved off', async () => {
      await create();
      const box = field('enabled');
      box.checked = false;
      box.dispatchEvent(new Event('change'));
      await settle();
      expect(tabManager.clearSessionBudgets).toHaveBeenCalledTimes(1);
    });

    it('keeps the tab budgets when turning the budget off is not saved', async () => {
      writeReply = async () => ({ success: true, data: { success: false } });
      await create();
      const box = field('enabled');
      box.checked = false;
      box.dispatchEvent(new Event('change'));
      await settle();
      expect(tabManager.clearSessionBudgets).not.toHaveBeenCalled();
    });

    it('writes the unit', async () => {
      await create();
      choose('unit', 'cost');
      await settle();
      expect(writes()).toEqual([{ key: 'sessionBudget.unit', value: 'cost' }]);
      expect(rich('unit').value()).toBe('cost');
    });
  });
  it('describes the focused budget triggers with their help', async () => {
    await create();
    const description = (id: string) => (host().querySelector(`#${id}`)?.getAttribute('aria-describedby') ?? '')
      .split(' ').map((value) => host().querySelector(`[id="${value}"]`)?.textContent).join(' ');
    expect(description('session-budget-unit')).toContain('Tokens use chat usage; Cost uses priced models.');
    expect(description('session-budget-token-measure')).toContain('Weighted discounts cache reads; raw counts all tokens.');
  });

});
