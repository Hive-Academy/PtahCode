import { AdvancedOverviewStore } from '../advanced/advanced-overview.store';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ClaudeRpcService,
  ProvidersSettingsStateService,
  RpcResult,
  VSCodeService,
} from '@ptah-extension/core';
import type {
  AgentGetClaudeBuiltinsResult,
  AgentSetClaudeBuiltinParams,
  AgentSetClaudeBuiltinResult,
} from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { isDisabledControl } from '../feedback/busy-disabled.testing';
import {
  ClaudeBuiltinsConfigComponent,
  CLAUDE_BUILTINS_POLICY_UNVERIFIED,
  CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED,
  COULD_NOT_LOAD_CLAUDE_BUILTINS,
  COULD_NOT_UPDATE_CLAUDE_BUILTINS,
  formatApproxTokens,
} from './claude-builtins-config.component';
import { settingNotConfirmedMessage } from '../feedback/settings-save-feedback.service';
import type { BuiltinGroupId } from './claude-builtins-group.component';
import { ClaudeBuiltinsSyncService } from './claude-builtins-sync.service';

type Responder = () => RpcResult<unknown> | Promise<RpcResult<unknown>>;

const ok = <T>(data: T) => new RpcResult<T>(true, data);
const fail = (message: string) => new RpcResult<unknown>(false, undefined, message);

/** The shape of the backend catalog (`claude-builtin-catalog.ts`): ids, costs and the tool-to-skill map. */
function catalog(overrides: Partial<AgentGetClaudeBuiltinsResult> = {}): AgentGetClaudeBuiltinsResult {
  return {
    tools: [
      { id: 'Workflow', description: 'Launches a saved multi-step workflow script.', approxTokens: 2000, skillsNeedingIt: ['workflow-authoring'] },
      { id: 'ReportFindings', description: 'Sends code-review findings as a typed list.', approxTokens: 850, skillsNeedingIt: ['code-review'] },
      { id: 'PushNotification', description: 'Sends a desktop notification.', approxTokens: 10, skillsNeedingIt: [] },
      { id: 'DesignSync', description: 'Syncs claude.ai design files.', approxTokens: 10, skillsNeedingIt: [] },
      { id: 'EnterWorktree', description: 'Moves the session into a git worktree.', approxTokens: 10, skillsNeedingIt: [] },
      { id: 'ExitWorktree', description: 'Leaves a worktree session.', approxTokens: 10, skillsNeedingIt: [] },
    ],
    terminalSkills: [
      { id: 'keybindings-help', description: "Edits the terminal's keyboard bindings.", approxTokens: 90 },
      { id: 'update-config', description: "Edits Claude Code's settings.json hooks and permissions.", approxTokens: 270 },
      { id: 'fewer-permission-prompts', description: 'Mines CLI transcripts for a permission allowlist.', approxTokens: 70 },
      { id: 'plugin-authoring', description: 'Builds mods for the Claude terminal UI.', approxTokens: 100 },
      { id: 'init', description: 'Writes a CLAUDE.md for the project.', approxTokens: 25 },
      { id: 'workflow-authoring', description: 'Writes scripts for the Workflow tool.', approxTokens: 95, needsTool: 'Workflow' },
      { id: 'code-review', description: 'Reviews the current diff for bugs.', approxTokens: 460, needsTool: 'ReportFindings' },
    ],
    syncedSkills: [],
    enabledTools: [],
    enabledSkills: [],
    policyStatus: 'verified',
    ...overrides,
  };
}

describe('ClaudeBuiltinsConfigComponent', () => {
  let fixture: ComponentFixture<ClaudeBuiltinsConfigComponent>;
  let component: ClaudeBuiltinsConfigComponent;
  let feedback: SettingsSaveFeedbackService;
  let element: HTMLElement;
  let responses: Record<string, Responder>;
  /** The persisted lists the default responders read and change, like the backend's file settings. */
  let stored: { tools: string[]; skills: string[] };
  let lastSetItem: AgentSetClaudeBuiltinParams | undefined;
  const call = jest.fn();
  const callsOf = (method: string) => call.mock.calls.filter(([name]) => name === method);
  const SET = 'agent:setClaudeBuiltin';

  beforeEach(() => {
    stored = { tools: [], skills: [] };
    responses = {
      'agent:getClaudeBuiltins': () => ok(catalog({ enabledTools: [...stored.tools], enabledSkills: [...stored.skills] })),
      // Like the backend's atomic per-item update: only the named id changes in the stored list.
      'agent:setClaudeBuiltin': () => {
        if (!lastSetItem) throw new Error('missing params');
        const { kind, id, enabled } = lastSetItem;
        const key = kind === 'tool' ? 'tools' : 'skills';
        const without = stored[key].filter((item) => item !== id);
        stored[key] = enabled ? [...without, id] : without;
        return ok<AgentSetClaudeBuiltinResult>({
          success: true,
          enabledTools: [...stored.tools],
          enabledSkills: [...stored.skills],
        });
      },
    };
    call.mockReset();
    call.mockImplementation(async (method: string, params: unknown) => {
      const respond = responses[method];
      if (!respond) throw new Error(`unexpected RPC ${method}`);
      if (method === 'agent:setClaudeBuiltin') lastSetItem = params as AgentSetClaudeBuiltinParams;
      return respond();
    });
  });

  afterEach(() => {
    feedback?.dismiss();
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  async function settle(): Promise<void> {
    for (let pass = 0; pass < 6; pass += 1) {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      fixture.detectChanges();
    }
  }

  const GROUP_IDS: readonly BuiltinGroupId[] = ['tools', 'terminal', 'synced'];
  const groupHeader = (id: BuiltinGroupId) =>
    element.querySelector<HTMLButtonElement>(`[data-testid="claude-tools-group-${id}"] button[aria-expanded]`);
  const groupSwitch = (id: BuiltinGroupId) => byTestId<HTMLButtonElement>(`claude-tools-group-switch-${id}`);
  const groupBody = (id: BuiltinGroupId) => element.querySelector<HTMLElement>(`[data-testid="claude-tools-group-body-${id}"]`);
  const groupRows = (id: BuiltinGroupId) => Array.from(groupBody(id)?.querySelectorAll('ptah-claude-builtins-row') ?? []);
  const isOpen = (id: BuiltinGroupId) => groupHeader(id)?.getAttribute('aria-expanded') === 'true';
  /** A collapsed group renders no row: a spec opens the group, as a user does, before it reads the rows. */
  function openGroups(...ids: BuiltinGroupId[]): void {
    for (const id of ids.length > 0 ? ids : GROUP_IDS) {
      const header = groupHeader(id);
      if (header && !isOpen(id)) header.click();
    }
    fixture.detectChanges();
  }
  /** The accessible name of a row switch: the text of the element `aria-labelledby` refers to. */
  const nameOf = (box: HTMLElement) =>
    document.getElementById(box.getAttribute('aria-labelledby') ?? '')?.textContent?.trim();
  const setFilter = (value: string) => {
    const input = byTestId<HTMLInputElement>('claude-tools-filter');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  /** `open: 'all'` (default) opens the three groups after the load; `'default'` keeps the state a user first sees. */
  async function render(open: 'all' | 'default' = 'all'): Promise<void> {
    TestBed.configureTestingModule({
      imports: [ClaudeBuiltinsConfigComponent],
      providers: [
        AdvancedOverviewStore,
        { provide: ClaudeRpcService, useValue: { call } },
        { provide: ProvidersSettingsStateService, useValue: { commit: signal({ status: 'idle' }) } },
        { provide: VSCodeService, useValue: { isElectron: true, config: signal({}) } },
        SettingsSaveFeedbackService,
      ],
    });
    await TestBed.compileComponents();
    feedback = TestBed.inject(SettingsSaveFeedbackService);
    await mount(open);
  }

  /** Creates the card. The save feedback service is provided above the card, as on the Settings page. */
  async function mount(open: 'all' | 'default' = 'all'): Promise<void> {
    fixture = TestBed.createComponent(ClaudeBuiltinsConfigComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    await settle();
    if (open === 'all') openGroups();
  }

  /** Leaves the Advanced tab and returns: the card is destroyed and a new card is created. */
  async function remount(): Promise<ClaudeBuiltinsConfigComponent> {
    const destroyed = component;
    fixture.destroy();
    await mount();
    return destroyed;
  }

  const byTestId = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const el = element.querySelector<T>(`[data-testid="${id}"]`);
    if (!el) throw new Error(`missing [data-testid="${id}"]`);
    return el;
  };
  const queryTestId = (id: string) => element.querySelector(`[data-testid="${id}"]`);
  const toolBox = (id: string) => byTestId<HTMLInputElement>(`settings-toggle-claude-tool-${id}`);
  const skillBox = (id: string) => byTestId<HTMLInputElement>(`settings-toggle-claude-skill-${id}`);
  const GET = 'agent:getClaudeBuiltins';
  /** Holds each read from now on. A released read answers with the lists that are stored at that moment. */
  function holdReads(): Array<() => void> {
    const pending: Array<() => void> = [];
    const read = responses[GET];
    responses[GET] = () => new Promise((resolve) => { pending.push(() => resolve(read())); });
    return pending;
  }
  const savings = () => byTestId('claude-tools-savings').textContent?.replace(/\s+/g, ' ').trim();

  describe('formatApproxTokens', () => {
    it.each([
      [2000, '~2,000'],
      [850, '~850'],
      [1449, '~1,400'],
      [95, '~95'],
      [10, '~10'],
      [7, '~7'],
    ])('shows %d as %s (at most two significant digits)', (tokens, label) => {
      expect(formatApproxTokens(tokens)).toBe(label);
    });
  });

  describe('Load', () => {
    it('renders groups 1 and 2 from the catalog, unchecked by default, with costs and the applies note', async () => {
      await render();
      expect(
        element.querySelector('ptah-form-section')?.getAttribute('data-glass-surface'),
      ).toBe('content');

      expect(call).toHaveBeenCalledWith('agent:getClaudeBuiltins', {});
      expect(element.querySelectorAll('[data-testid^="settings-toggle-claude-tool-"]')).toHaveLength(6);
      expect(element.querySelectorAll('[data-testid^="settings-toggle-claude-skill-"]')).toHaveLength(7);
      expect(toolBox('Workflow').checked).toBe(false);
      expect(toolBox('Workflow').getAttribute('role')).toBe('switch');
      expect(nameOf(toolBox('Workflow'))).toBe('Workflow');
      expect(nameOf(skillBox('code-review'))).toBe('code-review');
      expect(groupHeader('tools')?.textContent).toContain('Built-in tools');
      expect(groupHeader('tools')?.textContent).toContain('Off by default');
      expect(groupHeader('tools')?.textContent).toContain('0/6 on · ~2,900 tokens');
      expect(groupHeader('terminal')?.textContent).toContain('Terminal-only skills');
      expect(groupHeader('terminal')?.textContent).toContain('0/7 on · ~1,100 tokens');
      expect(groupHeader('synced')?.textContent).toContain('Synced from claude.ai');
      expect(groupHeader('synced')?.textContent).toContain('Hidden by default');
      expect(byTestId('claude-tools-on-count').textContent?.trim()).toBe('0 of 13 on');
      expect(element.textContent).toContain('~2,000');
      expect(element.textContent).toContain('~850');
      expect(byTestId('claude-tools-applies-note').getAttribute('role')).toBe('note');
      expect(byTestId('claude-tools-applies-note').textContent).toContain('These settings apply to all your workspaces.');
      // Everything off: 2,890 (tools) + 1,110 (skills) = 4,000.
      expect(savings()).toBe('Saved per turn ~4,000 tokens');
      expect(byTestId('claude-tools-savings').getAttribute('aria-live')).toBe('polite');
      for (const id of GROUP_IDS) {
        expect(document.getElementById(groupHeader(id)?.getAttribute('aria-controls') ?? '')).toBe(groupBody(id));
      }
    });

    it('has one h2 heading with the Wrench icon, no second heading, one explanation block and no scroll wrapper', async () => {
      await render();

      const headings = Array.from(element.querySelectorAll('h1, h2, h3, h4'));
      expect(headings.map((heading) => `${heading.tagName} ${heading.textContent?.trim()}`)).toEqual([
        'H2 Claude Code tools & skills',
      ]);
      expect(element.querySelector('#claude-tools-heading')).toBeNull();
      expect(element.querySelector('ptah-form-section')?.getAttribute('aria-labelledby')).toBeNull();
      expect(element.querySelector('[data-testid="form-section-icon"]')).not.toBeNull();
      expect(element.querySelectorAll('ptah-alert')).toHaveLength(1);
      expect(element.innerHTML).not.toContain('overflow-x-auto');
    });

    it('opens only the first group by default; a closed group renders no row until the user opens it', async () => {
      await render('default');

      expect(GROUP_IDS.map(isOpen)).toEqual([true, false, false]);
      expect(element.querySelectorAll('[data-testid^="settings-toggle-claude-tool-"]')).toHaveLength(6);
      expect(element.querySelector('[data-testid^="settings-toggle-claude-skill-"]')).toBeNull();
      expect(groupBody('terminal')?.hidden).toBe(true);

      openGroups('terminal');
      expect(groupBody('terminal')?.hidden).toBe(false);
      expect(groupRows('terminal')).toHaveLength(7);

      groupHeader('terminal')?.click();
      fixture.detectChanges();
      expect(isOpen('terminal')).toBe(false);
      expect(groupRows('terminal')).toHaveLength(0);
    });

    it('keeps the summary bar sticky at the top of the fields column, and adds no block padding to the glass card', async () => {
      await render();

      const bar = byTestId('claude-tools-summary');
      expect(bar.className).toContain('sticky');
      expect(bar.className).toContain('top-0');
      expect(bar.className).toContain('z-[var(--ptah-z-raised)]');
      expect(bar.contains(byTestId('claude-tools-savings'))).toBe(true);
      expect(bar.contains(byTestId('claude-tools-filter'))).toBe(true);
      expect(bar.parentElement?.getAttribute('data-testid')).toBe('form-section-fields');
      expect(bar.nextElementSibling).toBe(byTestId('claude-tools-groups'));

      const card = element.querySelector('ptah-form-section');
      expect(card?.className).toContain('[[data-glass=on]_&>section]:py-0');
      expect(card?.querySelector('[style*="padding"]')).toBeNull();
    });

    it('checks the stored opt-ins and rounds the live savings to 100', async () => {
      stored = { tools: ['ReportFindings'], skills: ['code-review'] };
      await render();

      expect(toolBox('ReportFindings').checked).toBe(true);
      expect(skillBox('code-review').checked).toBe(true);
      // 4,000 - 850 - 460 = 2,690 -> 2,700.
      expect(savings()).toBe('Saved per turn ~2,700 tokens');
    });

    it('shows skeleton rows and an aria-busy card while loading, with no live toggles', async () => {
      let resolve: (value: RpcResult<unknown>) => void = () => undefined;
      responses['agent:getClaudeBuiltins'] = () => new Promise((r) => { resolve = r; });
      await render();

      expect(element.querySelector('ptah-form-section')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelectorAll('[data-testid="claude-tools-skeleton-group"]')).toHaveLength(3);
      expect(element.querySelectorAll('[data-testid="claude-tools-skeleton-row"]')).toHaveLength(4);
      expect(queryTestId('claude-tools-synced-empty')).toBeNull();
      expect(element.querySelector('[data-testid^="settings-toggle-claude-"]')).toBeNull();
      expect(element.querySelector('[role="switch"]')).toBeNull();
      expect(queryTestId('claude-tools-summary')).toBeNull();
      expect(byTestId('claude-tools-applies-note')).toBeTruthy();

      resolve(ok(catalog()));
      await settle();
      expect(element.querySelector('ptah-form-section')?.getAttribute('aria-busy')).toBeNull();
      expect(queryTestId('claude-tools-skeleton-row')).toBeNull();
    });

    it.each<[string, Responder]>([
      ['an RPC failure', () => fail('host detail: load failed')],
      ['a throw', () => { throw new Error('host detail: socket'); }],
    ])('%s shows the fixed load error with Retry and no toggles; Retry reloads', async (_, respond) => {
      responses['agent:getClaudeBuiltins'] = respond;
      await render();

      const alert = byTestId('claude-tools-load-error');
      expect(alert.getAttribute('role')).toBe('alert');
      expect(alert.textContent).toContain(COULD_NOT_LOAD_CLAUDE_BUILTINS);
      expect(element.textContent).not.toContain('host detail');
      expect(element.querySelector('[data-testid^="settings-toggle-claude-"]')).toBeNull();
      expect(element.querySelector('[role="switch"]')).toBeNull();
      expect(queryTestId('claude-tools-savings')).toBeNull();

      responses['agent:getClaudeBuiltins'] = () => ok(catalog());
      byTestId<HTMLButtonElement>('claude-tools-load-retry').click();
      await settle();
      expect(queryTestId('claude-tools-load-error')).toBeNull();
      expect(toolBox('Workflow')).toBeTruthy();
    });

    it('an unverified capability policy shows its own error with Retry and the returned catalog read-only', async () => {
      responses['agent:getClaudeBuiltins'] = () => ok(catalog({ policyStatus: 'unverified', enabledTools: ['Workflow'] }));
      await render();

      const alert = byTestId('claude-tools-load-error');
      expect(alert.textContent).toContain(CLAUDE_BUILTINS_POLICY_UNVERIFIED);
      expect(alert.textContent).not.toContain(COULD_NOT_LOAD_CLAUDE_BUILTINS);
      expect(alert.getAttribute('data-state')).toBe('unverified');
      expect(byTestId('claude-tools-load-retry')).toBeTruthy();

      // The returned catalog and the stored opt-ins are shown.
      expect(element.querySelectorAll('[data-testid^="settings-toggle-claude-tool-"]')).toHaveLength(6);
      expect(element.querySelectorAll('[data-testid^="settings-toggle-claude-skill-"]')).toHaveLength(7);
      expect(toolBox('Workflow').checked).toBe(true);
      expect(groupHeader('tools')?.textContent).toContain('1/6 on');
      expect(byTestId('claude-tools-savings')).toBeTruthy();

      // Each control is read-only: it is aria-disabled, keeps focus, and no path starts a write.
      for (const box of Array.from(element.querySelectorAll<HTMLInputElement>('input[role="switch"]'))) {
        expect(isDisabledControl(box)).toBe(true);
        expect(box.disabled).toBe(false);
      }
      for (const id of GROUP_IDS.slice(0, 2)) expect(groupSwitch(id).getAttribute('aria-disabled')).toBe('true');
      toolBox('Workflow').click();
      toolBox('DesignSync').click();
      groupSwitch('tools').click();
      groupSwitch('terminal').click();
      await component.toggle('tool', 'DesignSync');
      await component.toggleGroup('tools', true);
      await settle();
      expect(callsOf('agent:setClaudeBuiltin')).toEqual([]);
      expect(toolBox('Workflow').checked).toBe(true);
      expect(toolBox('DesignSync').checked).toBe(false);
      expect(feedback.toast()).toBeNull();

      // Retry with a verified policy makes the controls live.
      responses['agent:getClaudeBuiltins'] = () => ok(catalog({ enabledTools: ['Workflow'] }));
      byTestId<HTMLButtonElement>('claude-tools-load-retry').click();
      await settle();
      expect(queryTestId('claude-tools-load-error')).toBeNull();
      expect(isDisabledControl(toolBox('Workflow'))).toBe(false);
      expect(groupSwitch('tools').getAttribute('aria-disabled')).toBeNull();
    });

    it('a read failure with no data shows no rows, no group and no summary bar (not the read-only catalog)', async () => {
      responses['agent:getClaudeBuiltins'] = () => fail('host detail: load failed');
      await render();

      expect(byTestId('claude-tools-load-error').getAttribute('data-state')).toBe('failed');
      expect(byTestId('claude-tools-load-error').textContent).toContain(COULD_NOT_LOAD_CLAUDE_BUILTINS);
      expect(element.querySelector('ptah-claude-builtins-group')).toBeNull();
      expect(element.querySelector('ptah-claude-builtins-row')).toBeNull();
      expect(queryTestId('claude-tools-summary')).toBeNull();
      expect(queryTestId('claude-tools-skeleton')).toBeNull();
    });
  });

  describe('Group 3: skills synced from the claude.ai account', () => {
    const SYNCED = [
      { id: 'anthropic-skills:docx', name: 'docx', description: 'Creates and edits Word documents.', approxTokens: 120 },
      { id: 'anthropic-skills:init', name: 'init', description: 'Account copy of a skill named init.', approxTokens: 80 },
    ];
    const syncedTable = () => groupBody('synced');
    const withSynced = () =>
      ok(catalog({ syncedSkills: SYNCED, enabledTools: [...stored.tools], enabledSkills: [...stored.skills] }));

    it('lists each synced skill by name, unchecked, with its cost and a qualified toggle id', async () => {
      responses['agent:getClaudeBuiltins'] = withSynced;
      await render();

      const docx = skillBox('anthropic-skills:docx');
      expect(docx.checked).toBe(false);
      expect(nameOf(docx)).toBe('docx');
      expect(groupRows('synced')).toHaveLength(2);
      expect(syncedTable()?.textContent).toContain('Creates and edits Word documents.');
      expect(syncedTable()?.textContent).toContain('~120');
      expect(syncedTable()?.textContent).not.toContain('anthropic-skills:');
      expect(queryTestId('claude-tools-synced-empty')).toBeNull();
      // Groups 1-3 all off: 4,000 + 120 + 80 = 4,200.
      expect(savings()).toBe('Saved per turn ~4,200 tokens');
    });

    it('shows the empty state, and no group 3 table, when the account has no synced skills', async () => {
      await render();

      const empty = byTestId('claude-tools-synced-empty');
      expect(empty.textContent).toContain('No claude.ai skills found');
      expect(empty.textContent).toContain('If you sync skills from your claude.ai account, they will be listed here.');
      expect(groupRows('synced')).toHaveLength(0);
      expect(groupHeader('synced')?.textContent).toContain('Synced from claude.ai');
      expect(groupHeader('synced')?.textContent).toContain('0/0 on');
      // A group with no row has no group switch.
      expect(queryTestId('claude-tools-group-switch-synced')).toBeNull();
    });

    it('checks a stored synced opt-in apart from the terminal skill of the same name', async () => {
      stored.skills = ['anthropic-skills:init'];
      responses['agent:getClaudeBuiltins'] = withSynced;
      await render();

      expect(skillBox('anthropic-skills:init').checked).toBe(true);
      expect(skillBox('init').checked).toBe(false);
      // 4,200 - 80 = 4,120 -> 4,100.
      expect(savings()).toBe('Saved per turn ~4,100 tokens');
    });

    it('sends the qualified id, toasts the plain name, sums the savings live, and Undo sends the inverse call', async () => {
      responses['agent:getClaudeBuiltins'] = withSynced;
      await render();

      skillBox('anthropic-skills:docx').click();
      await settle();

      expect(callsOf(SET)).toEqual([[SET, { kind: 'skill', id: 'anthropic-skills:docx', enabled: true }]]);
      expect(skillBox('anthropic-skills:docx').checked).toBe(true);
      expect(skillBox('init').checked).toBe(false);
      expect(feedback.toast()?.message).toBe('Saved docx skill.');
      // 4,200 - 120 = 4,080 -> 4,100.
      expect(savings()).toBe('Saved per turn ~4,100 tokens');

      await feedback.undo();
      await settle();

      expect(call).toHaveBeenLastCalledWith(SET, { kind: 'skill', id: 'anthropic-skills:docx', enabled: false });
      expect(skillBox('anthropic-skills:docx').checked).toBe(false);
      expect(savings()).toBe('Saved per turn ~4,200 tokens');
    });

    it('a synced save with a lost answer re-reads the stored lists, shows the fixed unconfirmed text and keeps focus', async () => {
      responses['agent:getClaudeBuiltins'] = withSynced;
      responses[SET] = () => fail('host detail: EACCES');
      await render();

      const box = skillBox('anthropic-skills:docx');
      box.focus();
      box.click();
      await settle();

      expect(feedback.toast()?.message).toBe(settingNotConfirmedMessage('docx skill'));
      expect(element.textContent).not.toContain('host detail');
      expect(skillBox('anthropic-skills:docx').checked).toBe(false);
      expect(document.activeElement).toBe(skillBox('anthropic-skills:docx'));
    });

    it('marks group 3 toggles busy while a save runs', async () => {
      let resolve: (value: RpcResult<unknown>) => void = () => undefined;
      responses['agent:getClaudeBuiltins'] = withSynced;
      responses[SET] = () => new Promise((r) => { resolve = r; });
      await render();

      toolBox('Workflow').click();
      await settle();
      expect(isDisabledControl(skillBox('anthropic-skills:docx'))).toBe(true);

      resolve(ok({ success: true, enabledTools: ['Workflow'], enabledSkills: [] }));
      await settle();
      expect(isDisabledControl(skillBox('anthropic-skills:docx'))).toBe(false);
    });

    it('shows a skeleton header for group 3 while loading, then its rows', async () => {
      let resolve: (value: RpcResult<unknown>) => void = () => undefined;
      responses['agent:getClaudeBuiltins'] = () => new Promise((r) => { resolve = r; });
      await render();

      expect(element.querySelectorAll('[data-testid="claude-tools-skeleton-group"]')).toHaveLength(3);
      expect(syncedTable()).toBeNull();

      resolve(withSynced());
      await settle();
      openGroups('synced');
      expect(skillBox('anthropic-skills:docx')).toBeTruthy();
    });

    it('an unverified policy shows the synced rows read-only and refuses their writes', async () => {
      responses['agent:getClaudeBuiltins'] = () =>
        ok(catalog({ syncedSkills: SYNCED, policyStatus: 'unverified', enabledSkills: ['anthropic-skills:init'] }));
      await render();

      expect(byTestId('claude-tools-load-error').textContent).toContain(CLAUDE_BUILTINS_POLICY_UNVERIFIED);
      expect(groupRows('synced')).toHaveLength(2);
      expect(skillBox('anthropic-skills:init').checked).toBe(true);
      expect(isDisabledControl(skillBox('anthropic-skills:docx'))).toBe(true);
      expect(queryTestId('claude-tools-synced-empty')).toBeNull();

      skillBox('anthropic-skills:docx').click();
      groupSwitch('synced').click();
      await settle();
      expect(callsOf(SET)).toEqual([]);
      expect(skillBox('anthropic-skills:docx').checked).toBe(false);
    });
  });

  describe('Toggle, save and Undo', () => {
    it('sends one per-item call, toasts, updates the savings live, and Undo sends the inverse call', async () => {
      await render();

      toolBox('Workflow').click();
      await settle();

      expect(call).toHaveBeenCalledWith(SET, { kind: 'tool', id: 'Workflow', enabled: true });
      expect(toolBox('Workflow').checked).toBe(true);
      expect(savings()).toBe('Saved per turn ~2,000 tokens');
      expect(feedback.toast()?.tone).toBe('status');
      expect(feedback.toast()?.message).toBe('Saved Workflow tool.');
      expect(feedback.toast()?.canUndo).toBe(true);

      await feedback.undo();
      await settle();

      expect(call).toHaveBeenLastCalledWith(SET, { kind: 'tool', id: 'Workflow', enabled: false });
      expect(toolBox('Workflow').checked).toBe(false);
      expect(savings()).toBe('Saved per turn ~4,000 tokens');
    });

    it('sends only the skill id, never a list, so stored ids this card does not show are untouched', async () => {
      stored.skills = ['anthropic-skills:docs'];
      await render();

      skillBox('init').click();
      await settle();

      expect(callsOf('agent:setClaudeBuiltin')).toEqual([[SET, { kind: 'skill', id: 'init', enabled: true }]]);
      expect(callsOf('agent:setConfig')).toEqual([]);
      expect(stored.skills).toEqual(['anthropic-skills:docs', 'init']);
      expect(feedback.toast()?.message).toBe('Saved init skill.');
    });

    it('Undo restores only its own item, keeping a later toggle', async () => {
      await render();

      toolBox('Workflow').click();
      await settle();
      feedback.dismiss();
      toolBox('PushNotification').click();
      await settle();
      await feedback.undo();
      await settle();

      expect(call).toHaveBeenLastCalledWith(SET, { kind: 'tool', id: 'PushNotification', enabled: false });
      expect(toolBox('Workflow').checked).toBe(true);
      expect(toolBox('PushNotification').checked).toBe(false);
    });

    it.each<[string, Responder]>([
      ['a refused write', () => fail('host detail: write refused')],
      ['a throw', () => { throw new Error('host detail: socket'); }],
      ['an uncertain success without lists', () => ok({ success: true })],
    ])('%s re-reads, shows the stored state, keeps focus and toasts "could not confirm", never "not saved"', async (_, respond) => {
      responses['agent:setClaudeBuiltin'] = respond;
      await render();

      const box = skillBox('code-review');
      box.focus();
      box.click();
      await settle();

      expect(box.checked).toBe(false);
      expect(component.isSkillOn('code-review')).toBe(false);
      expect(document.activeElement).toBe(skillBox('code-review'));
      // No answer proves "not saved": the host write is not cancelled and can commit after the re-read.
      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toBe(settingNotConfirmedMessage('code-review skill'));
      expect(feedback.toast()?.message).not.toBe(COULD_NOT_UPDATE_CLAUDE_BUILTINS);
      expect(feedback.toast()?.message).not.toContain('host detail');
      expect(feedback.toast()?.canUndo).toBe(false);
      expect(savings()).toBe('Saved per turn ~4,000 tokens');
    });

    it('a timeout whose re-read shows the old state, with a late commit, is unconfirmed and not "not saved"', async () => {
      await render();
      const commit = responses[SET];
      // The renderer stops its wait. The host write stays in its queue.
      responses[SET] = () => fail('RPC timeout: agent:setClaudeBuiltin');

      toolBox('Workflow').click();
      await settle();

      // The re-read came before the commit: it shows the old state.
      expect(toolBox('Workflow').checked).toBe(false);
      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toBe('Could not confirm whether Workflow tool was saved.');
      expect(feedback.toast()?.message).not.toBe(COULD_NOT_UPDATE_CLAUDE_BUILTINS);
      expect(feedback.toast()?.message).not.toMatch(/not saved|could not update/i);

      // The host commits the queued write after the toast. The toast did not say that the change was not saved.
      commit();
      expect(stored.tools).toEqual(['Workflow']);
      responses[SET] = commit;
      await component.load();
      await settle();
      expect(toolBox('Workflow').checked).toBe(true);
    });

    it('an explicit rejection from the host toasts the fixed sentence and shows the stored state', async () => {
      responses[SET] = () => ok<AgentSetClaudeBuiltinResult>({ success: false, enabledTools: [], enabledSkills: [], error: 'host detail' });
      await render();

      toolBox('Workflow').click();
      await settle();

      expect(toolBox('Workflow').checked).toBe(false);
      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toBe(COULD_NOT_UPDATE_CLAUDE_BUILTINS);
      expect(feedback.toast()?.canUndo).toBe(false);
    });

    it.each<[string, (commit: Responder) => Responder]>([
      ['the transport rejects', (commit) => () => { commit(); throw new Error('host detail: socket closed'); }],
      ['the call times out', (commit) => () => { commit(); return fail('RPC timeout: agent:setClaudeBuiltin'); }],
    ])('a write that commits while %s is reconciled with the re-read: it is saved, with Undo', async (_, lost) => {
      await render();
      responses[SET] = lost(responses[SET]);
      const readsBefore = callsOf('agent:getClaudeBuiltins').length;

      const box = toolBox('Workflow');
      box.focus();
      box.click();
      await settle();

      expect(stored.tools).toEqual(['Workflow']);
      expect(callsOf('agent:getClaudeBuiltins').length).toBe(readsBefore + 1);
      expect(toolBox('Workflow').checked).toBe(true);
      expect(feedback.toast()?.tone).toBe('status');
      expect(feedback.toast()?.message).toBe('Saved Workflow tool.');
      expect(feedback.toast()?.canUndo).toBe(true);
      expect(savings()).toBe('Saved per turn ~2,000 tokens');
    });

    it('an uncertain write that no re-read can settle is reported as unconfirmed, not as not saved', async () => {
      await render();
      const commit = responses[SET];
      responses[SET] = () => { commit(); throw new Error('host detail: socket closed'); };
      responses['agent:getClaudeBuiltins'] = () => fail('host detail: load failed');

      toolBox('Workflow').click();
      await settle();

      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toBe(settingNotConfirmedMessage('Workflow tool'));
      expect(feedback.toast()?.message).not.toContain('host detail');
      expect(byTestId('claude-tools-load-error').textContent).toContain(COULD_NOT_LOAD_CLAUDE_BUILTINS);
    });

    it('an uncertain write is unconfirmed when the re-read is not verified; the rows become read-only', async () => {
      await render();
      responses[SET] = () => { throw new Error('host detail: socket closed'); };
      responses['agent:getClaudeBuiltins'] = () => ok(catalog({ policyStatus: 'unverified' }));

      const box = toolBox('Workflow');
      box.focus();
      box.click();
      await settle();

      expect(feedback.toast()?.message).toBe(settingNotConfirmedMessage('Workflow tool'));
      expect(byTestId('claude-tools-load-error').textContent).toContain(CLAUDE_BUILTINS_POLICY_UNVERIFIED);
      expect(isDisabledControl(toolBox('Workflow'))).toBe(true);
      expect(document.activeElement).toBe(toolBox('Workflow'));
    });

    it('marks every toggle busy (still focusable) while a save runs', async () => {
      let resolve: (value: RpcResult<unknown>) => void = () => undefined;
      responses['agent:setClaudeBuiltin'] = () => new Promise((r) => { resolve = r; });
      await render();

      const box = toolBox('Workflow');
      box.focus();
      box.click();
      await settle();

      expect(isDisabledControl(toolBox('ReportFindings'))).toBe(true);
      expect(toolBox('ReportFindings').disabled).toBe(false);
      expect(document.activeElement).toBe(box);

      resolve(ok({ success: true, enabledTools: ['Workflow'], enabledSkills: [] }));
      await settle();
      expect(isDisabledControl(toolBox('ReportFindings'))).toBe(false);
    });
  });

  describe('Dependency blocked', () => {
    it('omits dependency text and accessible references for skills without a dependency', async () => {
      await render();
      const checkbox = skillBox('keybindings-help');
      expect(checkbox.getAttribute('aria-describedby')).toBeNull();
      expect(queryTestId('claude-skill-dependency-keybindings-help')).toBeNull();
      expect(checkbox.closest('ptah-claude-builtins-row')?.textContent).not.toContain('None');
      expect(checkbox.closest('ptah-claude-builtins-row')?.textContent).not.toContain('Needs the');
    });

    it('badges a skill that is on while its tool is off; turning the tool on clears it and never changes the skill', async () => {
      stored.skills = ['code-review'];
      await render();

      const badge = byTestId('claude-skill-dependency-code-review');
      expect(badge.textContent?.trim()).toBe('ReportFindings is off');
      expect(badge.getAttribute('data-tone')).toBe('warn');
      expect(badge.getAttribute('data-appearance')).toBe('outline');
      expect(badge.getAttribute('title')).toBe('This skill is on but not available: ReportFindings is off.');
      const describedBy = skillBox('code-review').getAttribute('aria-describedby');
      expect(document.getElementById(describedBy ?? '')).toBe(badge);
      // The dependency note stays in the row of each skill that needs a tool, blocked or not.
      expect(skillBox('code-review').closest('ptah-claude-builtins-row')?.textContent).toContain(
        'Reviews the current diff for bugs. Needs the ReportFindings tool.',
      );
      expect(skillBox('workflow-authoring').closest('ptah-claude-builtins-row')?.textContent).toContain(
        'Needs the Workflow tool.',
      );
      // A default-off skill whose tool is also off is not "blocked": it is simply off.
      expect(queryTestId('claude-skill-dependency-workflow-authoring')).toBeNull();

      toolBox('ReportFindings').click();
      await settle();

      expect(queryTestId('claude-skill-dependency-code-review')).toBeNull();
      expect(skillBox('code-review').getAttribute('aria-describedby')).toBeNull();
      expect(skillBox('code-review').checked).toBe(true);
      expect(skillBox('workflow-authoring').checked).toBe(false);
      expect(callsOf('agent:setClaudeBuiltin')).toEqual([[SET, { kind: 'tool', id: 'ReportFindings', enabled: true }]]);
    });

    it('still counts a dependency-blocked skill as hidden; turning its tool on lowers the total by both costs', async () => {
      await render();

      skillBox('code-review').click();
      await settle();
      expect(skillBox('code-review').checked).toBe(true);
      // The backend still denies code-review while ReportFindings is off: the total stays 4,000.
      expect(savings()).toBe('Saved per turn ~4,000 tokens');

      feedback.dismiss();
      toolBox('ReportFindings').click();
      await settle();
      // 4,000 - 850 - 460 = 2,690 -> 2,700.
      expect(savings()).toBe('Saved per turn ~2,700 tokens');
    });
  });

  describe('Atomic per-item write (another writer)', () => {
    it('writes without a fresh read and shows the lists the call returns, including another writer\'s opt-in', async () => {
      await render();
      const readsBefore = callsOf('agent:getClaudeBuiltins').length;

      // Another window or `ptah agent config-set` turns Workflow on after this card loaded.
      stored.tools = ['Workflow'];
      toolBox('ReportFindings').click();
      await settle();

      expect(callsOf('agent:getClaudeBuiltins').length).toBe(readsBefore);
      expect(callsOf('agent:setClaudeBuiltin')).toEqual([[SET, { kind: 'tool', id: 'ReportFindings', enabled: true }]]);
      expect(callsOf('agent:setConfig')).toEqual([]);
      expect(stored.tools).toEqual(['Workflow', 'ReportFindings']);
      expect(toolBox('Workflow').checked).toBe(true);
      expect(toolBox('ReportFindings').checked).toBe(true);
    });

    it('takes both lists from the response, not from a local delta', async () => {
      stored.skills = ['init'];
      await render();

      responses['agent:setClaudeBuiltin'] = () =>
        ok<AgentSetClaudeBuiltinResult>({ success: true, enabledTools: ['DesignSync'], enabledSkills: ['update-config'] });
      skillBox('init').click();
      await settle();

      expect(component.enabledTools()).toEqual(['DesignSync']);
      expect(component.enabledSkills()).toEqual(['update-config']);
      expect(skillBox('init').checked).toBe(false);
      expect(skillBox('update-config').checked).toBe(true);
      expect(toolBox('DesignSync').checked).toBe(true);
    });

    it('Undo sends the inverse per-item call without a read and shows its returned lists', async () => {
      await render();

      toolBox('Workflow').click();
      await settle();
      stored.tools = [...stored.tools, 'DesignSync'];
      const readsBefore = callsOf('agent:getClaudeBuiltins').length;
      await feedback.undo();
      await settle();

      expect(callsOf('agent:getClaudeBuiltins').length).toBe(readsBefore);
      expect(call).toHaveBeenLastCalledWith(SET, { kind: 'tool', id: 'Workflow', enabled: false });
      expect(toolBox('Workflow').checked).toBe(false);
      expect(toolBox('DesignSync').checked).toBe(true);
    });

    it('a failed write re-reads the stored lists and shows them, not a local revert', async () => {
      responses['agent:setClaudeBuiltin'] = () => fail('host detail: write refused');
      await render();
      const readsBefore = callsOf('agent:getClaudeBuiltins').length;

      // The write fails, but the reload shows what is really stored now.
      stored.tools = ['PushNotification'];
      const box = toolBox('Workflow');
      box.focus();
      box.click();
      await settle();

      // Only the recovery read after the failed write.
      expect(callsOf('agent:getClaudeBuiltins').length).toBe(readsBefore + 1);
      expect(toolBox('Workflow').checked).toBe(false);
      expect(toolBox('PushNotification').checked).toBe(true);
      expect(component.enabledTools()).toEqual(['PushNotification']);
      expect(document.activeElement).toBe(toolBox('Workflow'));
      expect(feedback.toast()?.message).toBe(settingNotConfirmedMessage('Workflow tool'));
    });

    it('a failed write whose recovery read also fails shows the load error with Retry, focused', async () => {
      responses['agent:setClaudeBuiltin'] = () => { throw new Error('host detail: socket'); };
      await render();

      responses['agent:getClaudeBuiltins'] = () => fail('host detail: load failed');
      const box = toolBox('Workflow');
      box.focus();
      box.click();
      await settle();

      expect(byTestId('claude-tools-load-error').textContent).toContain(COULD_NOT_LOAD_CLAUDE_BUILTINS);
      expect(element.querySelector('[data-testid^="settings-toggle-claude-"]')).toBeNull();
      expect(document.activeElement).toBe(byTestId('claude-tools-load-retry'));
      expect(element.textContent).not.toContain('host detail');
    });

    it('serializes two quick toggles: the second is refused while the first save runs, then sends its own call', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => { release = r; });
      const persist = responses['agent:setClaudeBuiltin'];
      responses['agent:setClaudeBuiltin'] = async () => { await gate; return persist(); };
      await render();

      const first = component.toggle('tool', 'Workflow');
      const second = component.toggle('tool', 'ReportFindings');
      await second;
      expect(component.isToolOn('ReportFindings')).toBe(false);
      release();
      await first;
      await settle();

      expect(callsOf('agent:setClaudeBuiltin')).toEqual([[SET, { kind: 'tool', id: 'Workflow', enabled: true }]]);
      expect(stored.tools).toEqual(['Workflow']);

      feedback.dismiss();
      responses['agent:setClaudeBuiltin'] = persist;
      await component.toggle('tool', 'ReportFindings');
      await settle();
      expect(call).toHaveBeenLastCalledWith(SET, { kind: 'tool', id: 'ReportFindings', enabled: true });
      expect(toolBox('Workflow').checked).toBe(true);
      expect(toolBox('ReportFindings').checked).toBe(true);
    });
  });
  describe('Group switch (A-28, decision 9)', () => {
    const TOOL_IDS = ['Workflow', 'ReportFindings', 'PushNotification', 'DesignSync', 'EnterWorktree', 'ExitWorktree'];
    const progress = () => byTestId('claude-tools-group-progress').textContent?.trim();

    it('shows the state of the visible rows: off, mixed, on, with a label for the next action', async () => {
      await render();
      // The group control is a tri-state checkbox (mixed on a switch is off for assistive technology).
      expect(groupSwitch('tools').getAttribute('role')).toBe('checkbox');
      expect(groupSwitch('tools').tagName).toBe('BUTTON');
      expect(toolBox('Workflow').getAttribute('role')).toBe('switch');
      expect(groupSwitch('tools').getAttribute('aria-checked')).toBe('false');
      expect(groupSwitch('tools').getAttribute('aria-label')).toBe('Turn on all Built-in tools');
      expect(component.groupSwitchState('tools')).toBe('off');

      toolBox('Workflow').click();
      await settle();
      expect(groupSwitch('tools').getAttribute('aria-checked')).toBe('mixed');
      expect(groupSwitch('tools').getAttribute('aria-label')).toBe('Turn on all Built-in tools');
      expect(groupHeader('tools')?.textContent).toContain('1/6 on');
      expect(byTestId('claude-tools-on-count').textContent?.trim()).toBe('1 of 13 on');
    });

    it('runs one per-item call for each differing row, in order, with one toast; Undo sends the inverse calls', async () => {
      stored.tools = ['ReportFindings'];
      await render();

      groupSwitch('tools').click();
      await settle();

      const expected = TOOL_IDS.filter((id) => id !== 'ReportFindings');
      expect(callsOf(SET)).toEqual(expected.map((id) => [SET, { kind: 'tool', id, enabled: true }]));
      expect(callsOf('agent:setConfig')).toEqual([]);
      for (const id of TOOL_IDS) expect(toolBox(id).checked).toBe(true);
      expect(groupSwitch('tools').getAttribute('aria-checked')).toBe('true');
      expect(groupSwitch('tools').getAttribute('aria-label')).toBe('Turn off all Built-in tools');
      expect(feedback.toast()?.tone).toBe('status');
      expect(feedback.toast()?.message).toBe('Saved Built-in tools (5 turned on).');
      expect(feedback.toast()?.canUndo).toBe(true);
      expect(progress()).toBe('');

      call.mockClear();
      await feedback.undo();
      await settle();

      // Undo restores only the rows the switch changed: ReportFindings was on before and stays on.
      expect(callsOf(SET)).toEqual(expected.map((id) => [SET, { kind: 'tool', id, enabled: false }]));
      expect(feedback.toast()?.message).toBe('Restored Built-in tools (5 turned off).');
      expect(feedback.toast()?.canUndo).toBe(false);
      expect(stored.tools).toEqual(['ReportFindings']);
      expect(toolBox('ReportFindings').checked).toBe(true);
      expect(toolBox('Workflow').checked).toBe(false);
    });

    it('turns every row off when all rows are on', async () => {
      stored.tools = [...TOOL_IDS];
      await render();
      expect(groupSwitch('tools').getAttribute('aria-checked')).toBe('true');

      groupSwitch('tools').click();
      await settle();

      expect(callsOf(SET)).toEqual(TOOL_IDS.map((id) => [SET, { kind: 'tool', id, enabled: false }]));
      expect(stored.tools).toEqual([]);
      expect(feedback.toast()?.message).toBe('Saved Built-in tools (6 turned off).');
    });

    it('writes skills for a skill group and leaves the tools alone', async () => {
      await render();

      groupSwitch('terminal').click();
      await settle();

      expect(callsOf(SET)).toHaveLength(7);
      expect(callsOf(SET).every(([, params]) => (params as AgentSetClaudeBuiltinParams).kind === 'skill')).toBe(true);
      expect(stored.tools).toEqual([]);
      expect(feedback.toast()?.message).toBe('Saved Terminal-only skills (7 turned on).');
    });

    it('shows "Saving i of n" in a status region; the switch is aria-disabled, keeps focus and ignores clicks', async () => {
      const releases: Array<() => void> = [];
      const persist = responses[SET];
      responses[SET] = () => new Promise((resolve) => { releases.push(() => resolve(persist())); });
      await render();
      // The live region is exposed before its first message: not display:none, not removed while it is empty.
      const live = byTestId('claude-tools-group-progress');
      expect(live.getAttribute('role')).toBe('status');
      expect(live.className).toBe('sr-only');
      expect(live.hasAttribute('hidden')).toBe(false);
      expect(live.getAttribute('aria-hidden')).toBeNull();
      expect(progress()).toBe('');
      expect(queryTestId('claude-tools-group-progress-visual')).toBeNull();

      groupSwitch('tools').focus();
      groupSwitch('tools').click();
      await settle();

      expect(progress()).toBe('Saving 1 of 6');
      expect(byTestId('claude-tools-group-progress')).toBe(live);
      const visual = byTestId('claude-tools-group-progress-visual');
      expect(visual.textContent?.trim()).toBe('Saving 1 of 6');
      expect(visual.getAttribute('aria-hidden')).toBe('true');
      expect(groupSwitch('tools').getAttribute('aria-disabled')).toBe('true');
      expect(groupSwitch('tools').disabled).toBe(false);
      expect(groupSwitch('terminal').getAttribute('aria-disabled')).toBe('true');
      expect(isDisabledControl(toolBox('DesignSync'))).toBe(true);
      expect(document.activeElement).toBe(groupSwitch('tools'));

      // A click on a busy switch, and a second request, start nothing.
      groupSwitch('tools').click();
      groupSwitch('terminal').click();
      await component.toggleGroup('terminal', true);
      await component.toggle('tool', 'ExitWorktree');
      await settle();
      expect(callsOf(SET)).toHaveLength(1);

      releases[0]();
      await settle();
      expect(progress()).toBe('Saving 2 of 6');
      expect(toolBox('Workflow').checked).toBe(true);
      expect(toolBox('ReportFindings').checked).toBe(false);

      for (let index = 1; index < 6; index += 1) {
        releases[index]();
        await settle();
      }
      expect(progress()).toBe('');
      expect(byTestId('claude-tools-group-progress')).toBe(live);
      expect(queryTestId('claude-tools-group-progress-visual')).toBeNull();
      expect(callsOf(SET)).toHaveLength(6);
      expect(groupSwitch('tools').getAttribute('aria-disabled')).toBeNull();
      expect(document.activeElement).toBe(groupSwitch('tools'));
      expect(feedback.toast()?.message).toBe('Saved Built-in tools (6 turned on).');
    });

    it.each<[string, Responder, string]>([
      [
        'an explicit rejection',
        () => ok<AgentSetClaudeBuiltinResult>({ success: false, enabledTools: [], enabledSkills: [] }),
        '2 of 6 changes were not saved.',
      ],
      // A lost answer and an unchanged re-read: unconfirmed, and not in the "not saved" count.
      ['a lost answer with no stored change', () => fail('RPC timeout: agent:setClaudeBuiltin'), '2 of 6 changes could not be confirmed.'],
    ])('a partial failure (%s) keeps one toast "k of n" with Undo; Undo writes only the rows that saved', async (_, reject, message) => {
      const persist = responses[SET];
      responses[SET] = () =>
        lastSetItem && ['ReportFindings', 'DesignSync'].includes(lastSetItem.id) ? reject() : persist();
      await render();

      groupSwitch('tools').focus();
      groupSwitch('tools').click();
      await settle();

      // The sequence does not stop at a failed row.
      expect(callsOf(SET).map(([, params]) => (params as AgentSetClaudeBuiltinParams).id)).toEqual(TOOL_IDS);
      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toBe(message);
      expect(feedback.toast()?.message).not.toContain('host detail');
      expect(feedback.toast()?.canUndo).toBe(true);
      expect(toolBox('ReportFindings').checked).toBe(false);
      expect(toolBox('DesignSync').checked).toBe(false);
      expect(toolBox('Workflow').checked).toBe(true);
      expect(toolBox('ExitWorktree').checked).toBe(true);
      const saved = ['Workflow', 'PushNotification', 'EnterWorktree', 'ExitWorktree'];
      expect(stored.tools).toEqual(saved);
      expect(groupSwitch('tools').getAttribute('aria-checked')).toBe('mixed');
      expect(progress()).toBe('');
      expect(document.activeElement).toBe(groupSwitch('tools'));

      // Another writer turns DesignSync on before the Undo: the Undo must not touch it.
      stored.tools = [...stored.tools, 'DesignSync'];
      responses[SET] = persist;
      call.mockClear();
      await feedback.undo();
      await settle();

      expect(callsOf(SET)).toEqual(saved.map((id) => [SET, { kind: 'tool', id, enabled: false }]));
      expect(stored.tools).toEqual(['DesignSync']);
      expect(toolBox('DesignSync').checked).toBe(true);
      expect(toolBox('Workflow').checked).toBe(false);
      // The Undo toast gives the count and the direction of the Undo, not the text of the batch (6 turned on).
      expect(feedback.toast()?.tone).toBe('status');
      expect(feedback.toast()?.message).toBe('Restored Built-in tools (4 turned off).');
      expect(feedback.toast()?.canUndo).toBe(false);
    });

    it('a failure of every row offers no Undo', async () => {
      responses[SET] = () => ok<AgentSetClaudeBuiltinResult>({ success: false, enabledTools: [], enabledSkills: [] });
      await render();

      groupSwitch('tools').click();
      await settle();

      expect(feedback.toast()?.message).toBe('6 of 6 changes were not saved.');
      expect(feedback.toast()?.canUndo).toBe(false);
    });

    it.each<[string, Responder, string]>([
      [
        'an explicit rejection',
        () => ok<AgentSetClaudeBuiltinResult>({ success: false, enabledTools: [], enabledSkills: [] }),
        '5 of 6 changes were not saved.',
      ],
      [
        'a lost answer',
        () => fail('host detail: EACCES'),
        '4 of 6 changes were not saved. 1 of 6 changes could not be confirmed.',
      ],
    ])('stops when the recovery read fails too (%s): Retry focused, and Undo writes back the row that saved after a verified read', async (_, reject, message) => {
      const persist = responses[SET];
      responses[SET] = () => (lastSetItem?.id === 'ReportFindings' ? reject() : persist());
      await render();
      const read = responses['agent:getClaudeBuiltins'];
      responses['agent:getClaudeBuiltins'] = () => fail('host detail: load failed');

      groupSwitch('tools').focus();
      groupSwitch('tools').click();
      await settle();

      expect(callsOf(SET)).toHaveLength(2);
      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toBe(message);
      expect(feedback.toast()?.canUndo).toBe(true);
      expect(byTestId('claude-tools-load-error').textContent).toContain(COULD_NOT_LOAD_CLAUDE_BUILTINS);
      expect(element.querySelector('[role="switch"]')).toBeNull();
      expect(document.activeElement).toBe(byTestId('claude-tools-load-retry'));
      expect(stored.tools).toEqual(['Workflow']);

      // Undo while the read still fails: the policy is not verified, so no write is sent and Undo stays.
      call.mockClear();
      await feedback.undo();
      await settle();
      expect(callsOf(SET)).toEqual([]);
      expect(stored.tools).toEqual(['Workflow']);
      expect(feedback.toast()?.message).toBe(CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED);
      expect(feedback.toast()?.canUndo).toBe(true);

      // The read is verified again: only Workflow, the one row that saved, is written back.
      responses['agent:getClaudeBuiltins'] = read;
      await feedback.undo();
      await settle();
      expect(callsOf(SET)).toEqual([[SET, { kind: 'tool', id: 'Workflow', enabled: false }]]);
      expect(stored.tools).toEqual([]);
      expect(feedback.toast()?.message).toBe('Restored Built-in tools (1 turned off).');
      expect(queryTestId('claude-tools-load-error')).toBeNull();
      expect(toolBox('Workflow').checked).toBe(false);
      expect(toolBox('ReportFindings').checked).toBe(false);
    });

    it('counts a row as saved when its write commits and the transport rejects; the toast agrees with the rows', async () => {
      const persist = responses[SET];
      responses[SET] = () => {
        const answer = persist();
        if (lastSetItem?.id === 'ReportFindings') throw new Error('host detail: socket closed');
        return answer;
      };
      await render();

      groupSwitch('tools').click();
      await settle();

      expect(callsOf(SET)).toHaveLength(6);
      for (const id of TOOL_IDS) expect(toolBox(id).checked).toBe(true);
      expect(feedback.toast()?.tone).toBe('status');
      expect(feedback.toast()?.message).toBe('Saved Built-in tools (6 turned on).');

      // The rollback set has the reconciled row too.
      responses[SET] = persist;
      call.mockClear();
      await feedback.undo();
      await settle();
      expect(callsOf(SET)).toEqual(TOOL_IDS.map((id) => [SET, { kind: 'tool', id, enabled: false }]));
      expect(stored.tools).toEqual([]);
    });
  });

  describe('Group switch: uncertain delivery, unverified recovery, Retry with Undo (fix round 2)', () => {
    const TOOL_IDS = ['Workflow', 'ReportFindings', 'PushNotification', 'DesignSync', 'EnterWorktree', 'ExitWorktree'];
    const rejectReportFindings = () => {
      const persist = responses[SET];
      responses[SET] = () =>
        lastSetItem?.id === 'ReportFindings'
          ? ok<AgentSetClaudeBuiltinResult>({ success: false, enabledTools: [], enabledSkills: [] })
          : persist();
      return persist;
    };

    it('a row that times out, with an old re-read and a late commit, is unconfirmed and not in the failed count', async () => {
      const persist = responses[SET];
      let lateCommit: () => void = () => undefined;
      responses[SET] = () => {
        if (lastSetItem?.id !== 'ReportFindings') return persist();
        lateCommit = () => { stored.tools = [...stored.tools, 'ReportFindings']; };
        return fail('RPC timeout: agent:setClaudeBuiltin');
      };
      await render();

      groupSwitch('tools').click();
      await settle();

      expect(callsOf(SET)).toHaveLength(6);
      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toBe('1 of 6 changes could not be confirmed.');
      expect(feedback.toast()?.message).not.toMatch(/not saved/);
      expect(feedback.toast()?.canUndo).toBe(true);
      expect(toolBox('ReportFindings').checked).toBe(false);

      lateCommit();
      expect(stored.tools).toContain('ReportFindings');

      // Undo writes back the 5 rows that are known as saved. It does not send a call for the unconfirmed row.
      responses[SET] = persist;
      call.mockClear();
      await feedback.undo();
      await settle();
      expect(callsOf(SET)).toEqual(
        TOOL_IDS.filter((id) => id !== 'ReportFindings').map((id) => [SET, { kind: 'tool', id, enabled: false }]),
      );
      expect(feedback.toast()?.message).toBe('Restored Built-in tools (5 turned off).');
      // The answer of the Undo has the stored lists, so the card now shows the late commit.
      expect(toolBox('ReportFindings').checked).toBe(true);
    });

    it('a lost answer for every row reports all rows as unconfirmed and offers no Undo', async () => {
      responses[SET] = () => fail('RPC timeout: agent:setClaudeBuiltin');
      await render();

      groupSwitch('tools').click();
      await settle();

      expect(callsOf(SET)).toHaveLength(6);
      expect(feedback.toast()?.message).toBe('6 of 6 changes could not be confirmed.');
      expect(feedback.toast()?.canUndo).toBe(false);
    });

    it('with an unverified recovery read, Undo stays in the toast but sends no write until a read is verified', async () => {
      const persist = rejectReportFindings();
      await render();
      const read = responses[GET];
      responses[GET] = () => ok(catalog({ policyStatus: 'unverified', enabledTools: [...stored.tools] }));

      groupSwitch('tools').click();
      await settle();

      // Workflow saved, ReportFindings was rejected, the recovery read is unverified: the sequence stops.
      expect(callsOf(SET)).toHaveLength(2);
      expect(feedback.toast()?.message).toBe('5 of 6 changes were not saved.');
      expect(feedback.toast()?.canUndo).toBe(true);
      expect(byTestId('claude-tools-load-error').textContent).toContain(CLAUDE_BUILTINS_POLICY_UNVERIFIED);
      expect(isDisabledControl(toolBox('Workflow'))).toBe(true);

      // Undo reads first. The policy is still unverified: no write, a clear message, and Undo stays.
      responses[SET] = persist;
      call.mockClear();
      await feedback.undo();
      await settle();
      expect(callsOf(GET)).toHaveLength(1);
      expect(callsOf(SET)).toEqual([]);
      expect(stored.tools).toEqual(['Workflow']);
      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toBe(CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED);
      expect(feedback.toast()?.canUndo).toBe(true);
      expect(feedback.saving()).toBe(false);

      // A second try with the same answer is refused again.
      await feedback.undo();
      await settle();
      expect(callsOf(SET)).toEqual([]);
      expect(feedback.toast()?.canUndo).toBe(true);

      // The policy is verified again: Undo reads, then writes back the one row that saved.
      responses[GET] = read;
      await feedback.undo();
      await settle();
      expect(callsOf(SET)).toEqual([[SET, { kind: 'tool', id: 'Workflow', enabled: false }]]);
      expect(stored.tools).toEqual([]);
      expect(feedback.toast()?.tone).toBe('status');
      expect(feedback.toast()?.message).toBe('Restored Built-in tools (1 turned off).');
      expect(queryTestId('claude-tools-load-error')).toBeNull();
      expect(toolBox('Workflow').checked).toBe(false);
      expect(isDisabledControl(toolBox('Workflow'))).toBe(false);
    });

    /** Workflow saved, ReportFindings was rejected and the recovery read was unverified: Undo is in the toast. */
    async function partialWithUnverifiedRecovery(): Promise<void> {
      const persist = rejectReportFindings();
      await render();
      responses[GET] = () => ok(catalog({ policyStatus: 'unverified', enabledTools: [...stored.tools] }));
      groupSwitch('tools').click();
      await settle();
      expect(stored.tools).toEqual(['Workflow']);
      expect(feedback.toast()?.canUndo).toBe(true);
      responses[SET] = persist;
      call.mockClear();
    }
    const expectUndoRefused = () => {
      expect(callsOf(SET)).toEqual([]);
      expect(stored.tools).toEqual(['Workflow']);
      expect(feedback.toast()?.tone).toBe('alert');
      expect(feedback.toast()?.message).toBe(CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED);
      expect(feedback.toast()?.canUndo).toBe(true);
      expect(feedback.saving()).toBe(false);
    };

    it.each<[string, Responder]>([
      ['times out', () => fail('RPC timeout: agent:getClaudeBuiltins')],
      ['throws', () => { throw new Error('transport closed'); }],
      ['has no data', () => ok(undefined)],
    ])('after an unverified recovery read, an Undo whose verification read %s sends no write and stays offered', async (_name, respond) => {
      await partialWithUnverifiedRecovery();
      responses[GET] = respond;

      await feedback.undo();
      await settle();

      expect(callsOf(GET)).toHaveLength(1);
      expectUndoRefused();
    });

    it('a verified read of the Undo that a newer unverified Retry replaced does not authorize the Undo', async () => {
      await partialWithUnverifiedRecovery();
      // The host samples a verified policy for the read of the Undo, but that answer is held.
      let releaseOld: () => void = () => undefined;
      const verified = ok(catalog({ enabledTools: [...stored.tools] }));
      const answers: Responder[] = [
        () => new Promise((resolve) => { releaseOld = () => resolve(verified); }),
        () => ok(catalog({ policyStatus: 'unverified', enabledTools: [...stored.tools] })),
      ];
      responses[GET] = () => (answers.shift() ?? (() => fail('unexpected read')))();

      const undone = feedback.undo();
      await settle();
      expect(callsOf(GET)).toHaveLength(1);
      // Retry starts a newer read. It answers first, with an unverified policy: the card is read-only.
      byTestId<HTMLButtonElement>('claude-tools-load-retry').click();
      await settle();
      expect(callsOf(GET)).toHaveLength(2);
      expect(component.loadState()).toBe('unverified');

      // The older verified answer comes last. It is not the newest read: no write, and the card stays read-only.
      releaseOld();
      await settle();
      await undone;
      await settle();
      expect(callsOf(GET)).toHaveLength(2);
      expectUndoRefused();
      expect(component.loadState()).toBe('unverified');
      expect(isDisabledControl(toolBox('Workflow'))).toBe(true);

      // The Undo that is offered again reads again. The unverified policy of the Retry still refuses it.
      await feedback.undo();
      await settle();
      expect(callsOf(GET)).toHaveLength(3);
      expectUndoRefused();
    });

    it('an Undo that is offered again after a partial restore writes only the row that was not restored', async () => {
      await render();
      groupSwitch('tools').click();
      await settle();
      expect(stored.tools).toEqual(TOOL_IDS);

      // The Undo restores 5 rows. The host rejects the restore of ReportFindings.
      const persist = rejectReportFindings();
      await feedback.undo();
      await settle();
      expect(stored.tools).toEqual(['ReportFindings']);
      expect(feedback.toast()?.message).toBe('1 of 6 changes were not saved.');
      expect(feedback.toast()?.canUndo).toBe(true);

      // Another window that shares the settings turns Workflow on again.
      stored.tools = [...stored.tools, 'Workflow'];
      responses[SET] = persist;
      call.mockClear();
      await feedback.undo();
      await settle();

      expect(callsOf(SET)).toEqual([[SET, { kind: 'tool', id: 'ReportFindings', enabled: false }]]);
      expect(stored.tools).toEqual(['Workflow']);
      expect(feedback.toast()?.tone).toBe('status');
      expect(feedback.toast()?.message).toBe('Restored Built-in tools (1 turned off).');
      expect(toolBox('Workflow').checked).toBe(true);
    });

    /** One row saved (Workflow), the recovery read failed: the card shows Retry, the toast shows Undo. */
    async function partialWithFailedRecovery(): Promise<Array<() => void>> {
      const persist = rejectReportFindings();
      await render();
      const read = responses[GET];
      responses[GET] = () => fail('host detail: load failed');
      groupSwitch('tools').click();
      await settle();
      expect(feedback.toast()?.canUndo).toBe(true);
      expect(byTestId('claude-tools-load-retry')).toBeTruthy();
      responses[SET] = persist;
      responses[GET] = read;
      return holdReads();
    }
    const expectLoadedAfterUndo = () => {
      expect(component.loadState()).toBe('loaded');
      expect(queryTestId('claude-tools-skeleton')).toBeNull();
      expect(queryTestId('claude-tools-load-error')).toBeNull();
      expect(stored.tools).toEqual([]);
      expect(toolBox('Workflow').checked).toBe(false);
      expect(isDisabledControl(toolBox('Workflow'))).toBe(false);
      expect(feedback.saving()).toBe(false);
      expect(feedback.toast()?.message).toBe('Restored Built-in tools (1 turned off).');
    };

    it('Retry, then Undo: the Undo ends before the read of the Retry, and the card is not stuck in loading', async () => {
      const reads = await partialWithFailedRecovery();

      byTestId<HTMLButtonElement>('claude-tools-load-retry').click();
      await settle();
      expect(reads).toHaveLength(1);
      expect(byTestId('claude-tools-skeleton')).toBeTruthy();

      const undone = feedback.undo();
      await settle();
      expect(reads).toHaveLength(2);
      // The read of the Undo answers, the Undo writes and ends. The read of the Retry is still held.
      reads[1]();
      await settle();
      await undone;
      await settle();
      expect(callsOf(SET).at(-1)).toEqual([SET, { kind: 'tool', id: 'Workflow', enabled: false }]);
      expectLoadedAfterUndo();

      // The old read of the Retry answers last: it is dropped and changes nothing.
      reads[0]();
      await settle();
      expect(reads).toHaveLength(2);
      expectLoadedAfterUndo();
    });

    it('Undo, then Retry: the replaced read of the Undo sends no write, a new read ends the loading state, and Undo stays', async () => {
      const reads = await partialWithFailedRecovery();

      const undone = feedback.undo();
      await settle();
      expect(reads).toHaveLength(1);
      byTestId<HTMLButtonElement>('claude-tools-load-retry').click();
      await settle();
      expect(reads).toHaveLength(2);
      expect(byTestId('claude-tools-skeleton')).toBeTruthy();

      // The read of the Undo answers. The read of the Retry replaced it, so the Undo sends no write.
      const writes = callsOf(SET).length;
      reads[0]();
      await settle();
      expect(callsOf(SET)).toHaveLength(writes);
      // The Undo does not end in `loading`: it starts a new read and stays busy until that read applied.
      expect(reads).toHaveLength(3);
      expect(feedback.saving()).toBe(true);
      expect(component.loadState()).toBe('loading');

      // The read of the Retry answers: it is dropped. The card still waits for the new read.
      reads[1]();
      await settle();
      expect(component.loadState()).toBe('loading');

      reads[2]();
      await settle();
      await undone;
      await settle();
      expect(component.loadState()).toBe('loaded');
      expect(callsOf(SET)).toHaveLength(writes);
      expect(stored.tools).toEqual(['Workflow']);
      expect(feedback.toast()?.message).toBe(CLAUDE_BUILTINS_UNDO_POLICY_UNVERIFIED);
      expect(feedback.toast()?.canUndo).toBe(true);

      // The newest read is verified now: the Undo that is offered again writes back the one row that saved.
      await feedback.undo();
      await settle();
      expect(reads).toHaveLength(3);
      expect(callsOf(SET).at(-1)).toEqual([SET, { kind: 'tool', id: 'Workflow', enabled: false }]);
      expectLoadedAfterUndo();
    });
  });

  describe('A write or an Undo that outlives the card (navigation away from Advanced)', () => {
    const TOOL_IDS = ['Workflow', 'ReportFindings', 'PushNotification', 'DesignSync', 'EnterWorktree', 'ExitWorktree'];

    it('the remounted card keeps its controls busy, and starts no write, until the refresh for the settlement applied', async () => {
      const releases: Array<() => void> = [];
      const persist = responses[SET];
      responses[SET] = () => new Promise((resolve) => { releases.push(() => resolve(persist())); });
      await render();

      groupSwitch('tools').click();
      await settle();
      releases[0]();
      await settle();

      // Return to Advanced during the batch: the new card has an intermediate snapshot (only Workflow is on).
      await remount();
      const reads = holdReads();
      for (let index = 1; index < 6; index += 1) {
        releases[index]();
        await settle();
      }

      // The batch settled and the page is not saving, but the refresh of the new card did not answer yet.
      expect(feedback.saving()).toBe(false);
      expect(feedback.toast()?.message).toBe('Saved Built-in tools (6 turned on).');
      expect(reads).toHaveLength(1);
      expect(stored.tools).toEqual(TOOL_IDS);
      expect(toolBox('ReportFindings').checked).toBe(false);
      expect(component.syncing()).toBe(true);
      expect(isDisabledControl(toolBox('ReportFindings'))).toBe(true);
      expect(toolBox('ReportFindings').disabled).toBe(false);
      expect(groupSwitch('tools').getAttribute('aria-disabled')).toBe('true');

      // No path starts a write from the old lists, and no new Undo replaces the Undo of the batch.
      responses[SET] = persist;
      call.mockClear();
      toolBox('ReportFindings').click();
      groupSwitch('tools').click();
      await component.toggle('tool', 'ReportFindings');
      await component.toggleGroup('tools', true);
      await settle();
      expect(callsOf(SET)).toEqual([]);
      expect(toolBox('ReportFindings').checked).toBe(false);
      expect(feedback.toast()?.message).toBe('Saved Built-in tools (6 turned on).');
      expect(feedback.toast()?.canUndo).toBe(true);

      // The refresh applies: the card shows the settled state and works as usual.
      reads[0]();
      await settle();
      expect(component.syncing()).toBe(false);
      for (const id of TOOL_IDS) expect(toolBox(id).checked).toBe(true);
      expect(isDisabledControl(toolBox('ReportFindings'))).toBe(false);
      expect(groupSwitch('tools').getAttribute('aria-disabled')).toBeNull();

      toolBox('ReportFindings').click();
      await settle();
      expect(callsOf(SET)).toEqual([[SET, { kind: 'tool', id: 'ReportFindings', enabled: false }]]);
      expect(feedback.toast()?.message).toBe('Saved ReportFindings tool.');
    });

    it('the sync service publishes a number for the source card, not the card', async () => {
      await render();
      const sync = TestBed.inject(ClaudeBuiltinsSyncService);
      expect(sync.settled()).toBeNull();

      toolBox('Workflow').click();
      await settle();

      const settled = sync.settled();
      expect(settled).toEqual({ revision: 1, sourceId: expect.any(Number) });
      expect(Object.values(settled ?? {}).every((value) => typeof value === 'number')).toBe(true);

      // A second card instance has another id.
      await remount();
      toolBox('DesignSync').click();
      await settle();
      expect(sync.settled()?.revision).toBe(2);
      expect(sync.settled()?.sourceId).not.toBe(settled?.sourceId);
    });

    it('a group write that ends after the card was destroyed leaves its signals alone; the new card shows the result', async () => {
      const releases: Array<() => void> = [];
      const persist = responses[SET];
      responses[SET] = () => new Promise((resolve) => { releases.push(() => resolve(persist())); });
      await render();

      groupSwitch('tools').click();
      await settle();
      releases[0]();
      await settle();
      expect(toolBox('Workflow').checked).toBe(true);

      // Leave Advanced during the held second write, then return: the new card reads an intermediate state.
      const destroyed = await remount();
      const atDestroy = { tools: destroyed.enabledTools(), progress: destroyed.groupProgress(), state: destroyed.loadState() };
      expect(toolBox('Workflow').checked).toBe(true);
      expect(toolBox('ReportFindings').checked).toBe(false);
      expect(isDisabledControl(toolBox('ReportFindings'))).toBe(true);
      expect(groupSwitch('tools').getAttribute('aria-disabled')).toBe('true');

      for (let index = 1; index < 6; index += 1) {
        releases[index]();
        await settle();
      }

      expect(callsOf(SET)).toHaveLength(6);
      expect(stored.tools).toEqual(TOOL_IDS);
      expect(feedback.toast()?.message).toBe('Saved Built-in tools (6 turned on).');
      // The destroyed card wrote none of its signals after it was destroyed.
      expect(destroyed.enabledTools()).toBe(atDestroy.tools);
      expect(destroyed.groupProgress()).toBe(atDestroy.progress);
      expect(destroyed.loadState()).toBe(atDestroy.state);
      // The mounted card shows the settled state, and its controls are live again.
      for (const id of TOOL_IDS) expect(toolBox(id).checked).toBe(true);
      expect(groupSwitch('tools').getAttribute('aria-checked')).toBe('true');
      expect(isDisabledControl(toolBox('ReportFindings'))).toBe(false);
      expect(savings()).toBe('Saved per turn ~1,100 tokens');

      // Undo belongs to the destroyed card: it writes the stored lists, and the mounted card shows them.
      responses[SET] = persist;
      await feedback.undo();
      await settle();
      expect(stored.tools).toEqual([]);
      for (const id of TOOL_IDS) expect(toolBox(id).checked).toBe(false);
      expect(destroyed.enabledTools()).toBe(atDestroy.tools);
    });

    it('Undo of a single toggle after a remount changes the mounted card', async () => {
      await render();
      toolBox('Workflow').click();
      await settle();
      expect(feedback.toast()?.canUndo).toBe(true);

      const destroyed = await remount();
      expect(toolBox('Workflow').checked).toBe(true);

      await feedback.undo();
      await settle();

      expect(call).toHaveBeenLastCalledWith('agent:getClaudeBuiltins', {});
      expect(callsOf(SET)).toEqual([
        [SET, { kind: 'tool', id: 'Workflow', enabled: true }],
        [SET, { kind: 'tool', id: 'Workflow', enabled: false }],
      ]);
      expect(toolBox('Workflow').checked).toBe(false);
      expect(savings()).toBe('Saved per turn ~4,000 tokens');
      expect(destroyed.enabledTools()).toEqual(['Workflow']);
    });

    it('a write of the mounted card causes no extra read of that card', async () => {
      await render();
      const readsBefore = callsOf('agent:getClaudeBuiltins').length;
      toolBox('Workflow').click();
      await settle();
      expect(callsOf('agent:getClaudeBuiltins').length).toBe(readsBefore);
    });

    it('a failed held write of a destroyed card does not put the destroyed card in an error state', async () => {
      let reject: () => void = () => undefined;
      responses[SET] = () => new Promise((resolve) => { reject = () => resolve(fail('host detail: EACCES')); });
      await render();

      toolBox('Workflow').click();
      await settle();
      const destroyed = await remount();
      responses['agent:getClaudeBuiltins'] = () => fail('host detail: load failed');
      reject();
      await settle();

      expect(destroyed.loadState()).toBe('loaded');
      expect(feedback.toast()?.message).toBe(settingNotConfirmedMessage('Workflow tool'));
      // The mounted card did its own read, which failed: it shows the load error with Retry.
      expect(byTestId('claude-tools-load-error').textContent).toContain(COULD_NOT_LOAD_CLAUDE_BUILTINS);
    });
  });

  describe('Filter (A-28)', () => {
    const SYNCED = [
      { id: 'anthropic-skills:docx', name: 'docx', description: 'Creates and edits Word documents.', approxTokens: 120 },
    ];

    it('hides the rows and the groups with no match, opens the groups with a match, and Clear restores', async () => {
      responses['agent:getClaudeBuiltins'] = () => ok(catalog({ syncedSkills: SYNCED }));
      await render('default');
      expect(queryTestId('claude-tools-filter-clear')).toBeNull();

      // Case-insensitive, on the name ("EnterWorktree", "ExitWorktree") and on the description ("...git worktree").
      setFilter('  WORKTREE ');

      expect(groupRows('tools')).toHaveLength(2);
      expect(toolBox('EnterWorktree')).toBeTruthy();
      expect(queryTestId('settings-toggle-claude-tool-Workflow')).toBeNull();
      expect(queryTestId('claude-tools-group-terminal')).toBeNull();
      expect(queryTestId('claude-tools-group-synced')).toBeNull();
      // The count of the group and of the bar stay the totals, not the filtered rows.
      expect(groupHeader('tools')?.textContent).toContain('0/6 on');
      expect(byTestId('claude-tools-on-count').textContent?.trim()).toBe('0 of 14 on');

      // A match in a closed group opens it; the match is on the description.
      setFilter('word documents');
      expect(queryTestId('claude-tools-group-tools')).toBeNull();
      expect(isOpen('synced')).toBe(true);
      expect(skillBox('anthropic-skills:docx')).toBeTruthy();

      // A filter controls the groups: the disclosure is exposed as unavailable and does not close the group.
      expect(groupHeader('synced')?.getAttribute('aria-disabled')).toBe('true');
      expect(groupHeader('synced')?.disabled).toBe(false);
      groupHeader('synced')?.click();
      fixture.detectChanges();
      expect(isOpen('synced')).toBe(true);

      byTestId<HTMLButtonElement>('claude-tools-filter-clear').click();
      await settle();

      expect(byTestId<HTMLInputElement>('claude-tools-filter').value).toBe('');
      expect(document.activeElement).toBe(byTestId('claude-tools-filter'));
      expect(GROUP_IDS.map(isOpen)).toEqual([true, false, false]);
      expect(groupRows('tools')).toHaveLength(6);

      // Normal activation returns when the filter clears.
      for (const id of GROUP_IDS) expect(groupHeader(id)?.getAttribute('aria-disabled')).toBeNull();
      groupHeader('synced')?.click();
      fixture.detectChanges();
      expect(isOpen('synced')).toBe(true);
      groupHeader('synced')?.click();
      fixture.detectChanges();
      expect(isOpen('synced')).toBe(false);
    });

    it('matches the dependency note of a skill', async () => {
      await render('default');
      setFilter('needs the workflow');
      expect(groupRows('terminal')).toHaveLength(1);
      expect(skillBox('workflow-authoring')).toBeTruthy();
    });

    it('shows "No match" with Clear when no row matches; Clear restores the groups', async () => {
      await render('default');

      setFilter('zzz-nothing');
      const empty = byTestId('claude-tools-no-match');
      expect(empty.textContent).toContain('No tools or skills match "zzz-nothing"');
      expect(element.querySelector('ptah-claude-builtins-group')).toBeNull();
      // The empty state of the synced group is not a filter result.
      expect(queryTestId('claude-tools-synced-empty')).toBeNull();

      byTestId<HTMLButtonElement>('claude-tools-no-match-clear').click();
      await settle();
      expect(queryTestId('claude-tools-no-match')).toBeNull();
      expect(element.querySelectorAll('ptah-claude-builtins-group')).toHaveLength(3);
      expect(document.activeElement).toBe(byTestId('claude-tools-filter'));
    });

    it('Esc clears a set filter and stops there; with no filter Esc goes on to the page', async () => {
      await render('default');
      const escaped = jest.fn();
      element.addEventListener('keydown', escaped);
      const input = byTestId<HTMLInputElement>('claude-tools-filter');

      setFilter('worktree');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();
      expect(input.value).toBe('');
      expect(escaped).not.toHaveBeenCalled();

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(escaped).toHaveBeenCalledTimes(1);
    });

    it('the group switch acts on the visible rows only, and its label gives their number', async () => {
      await render('default');
      setFilter('worktree');

      expect(groupSwitch('tools').getAttribute('aria-label')).toBe('Turn on 2 shown in Built-in tools');
      groupSwitch('tools').click();
      await settle();

      expect(callsOf(SET)).toEqual([
        [SET, { kind: 'tool', id: 'EnterWorktree', enabled: true }],
        [SET, { kind: 'tool', id: 'ExitWorktree', enabled: true }],
      ]);
      expect(feedback.toast()?.message).toBe('Saved Built-in tools (2 turned on).');
      expect(groupSwitch('tools').getAttribute('aria-checked')).toBe('true');
      expect(groupSwitch('tools').getAttribute('aria-label')).toBe('Turn off 2 shown in Built-in tools');

      byTestId<HTMLButtonElement>('claude-tools-filter-clear').click();
      await settle();
      expect(groupSwitch('tools').getAttribute('aria-checked')).toBe('mixed');
      expect(groupHeader('tools')?.textContent).toContain('2/6 on');
      expect(toolBox('Workflow').checked).toBe(false);
    });
  });

  it('reports loaded tools and savings and clears the overview after a failed reload', async () => {
    await render();
    const overview = TestBed.inject(AdvancedOverviewStore);
    expect(overview.segments().find((segment) => segment.id === 'claude-tools')).toMatchObject({ value: '0 of 6 on', meta: 'Saves 4,000 tokens', tone: 'ok' });
    responses['agent:getClaudeBuiltins'] = () => fail('unavailable');
    await component.load();
    await settle();
    expect(overview.segments().find((segment) => segment.id === 'claude-tools')).toMatchObject({ value: 'Not loaded', tone: 'idle' });
  });

});
