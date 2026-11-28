import { signal } from '@angular/core';
import { DeferBlockBehavior, DeferBlockState, TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ClaudeRpcService,
  EffortStateService,
  ProvidersSettingsStateService,
  VSCodeService,
  WorkspaceScopeService,
} from '@ptah-extension/core';
import { rpcError, rpcSuccess } from '@ptah-extension/core/testing';
import type { EffortLevel } from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { UltracodeStateService } from '../../services/ultracode-state.service';
import { AdvancedOverviewStore } from '../advanced/advanced-overview.store';
import { AgentBehaviourSectionComponent } from './agent-behaviour-section.component';
import { isDisabledControl } from '../feedback/busy-disabled.testing';

type Handler = (params: unknown) => unknown;

describe('AgentBehaviourSectionComponent', () => {
  let fixture: ComponentFixture<AgentBehaviourSectionComponent>;
  let component: AgentBehaviourSectionComponent;
  let element: HTMLElement;
  let feedback: SettingsSaveFeedbackService;
  let handlers: Record<string, Handler>;
  let call: jest.Mock;
  let workspace: ReturnType<typeof signal<string | undefined>>;
  let effort: ReturnType<typeof signal<EffortLevel | undefined>>;
  let setEffort: jest.Mock;
  let ultracodeEnabled: ReturnType<typeof signal<boolean>>;
  let ultracodeToggle: jest.Mock;

  /** Mirrors EffortStateService: optimistic set, rolled back when the write fails. */
  function effortWrites(succeed: boolean): void {
    setEffort.mockImplementation(async (next: EffortLevel | undefined) => {
      const previous = effort();
      effort.set(next);
      if (!succeed) effort.set(previous);
      return succeed;
    });
  }

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(AgentBehaviourSectionComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Lets the (change) handler's async save finish. Not `whenStable()`: the toast's 8 s
   * dismiss timer keeps the zone unstable for the whole toast lifetime.
   */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  const checkbox = (label: string) =>
    element.querySelector<HTMLInputElement>(
      `input[aria-label="${label}"]`,
    ) as HTMLInputElement;

  async function click(label: string): Promise<void> {
    checkbox(label).click();
    await settle();
  }

  beforeEach(() => {
    handlers = {
      'enhancedPrompts:getStatus': () =>
        rpcSuccess({ enabled: false, hasGeneratedPrompt: true }),
      'enhancedPrompts:setEnabled': () => rpcSuccess({ success: true }),
      'agent:getConfig': () => rpcSuccess({ workflowsDisabled: false }),
      'agent:setConfig': () => rpcSuccess({ success: true }),
    };
    call = jest.fn(
      async (method: string, params: unknown) =>
        handlers[method]?.(params) ?? rpcSuccess(undefined),
    );
    workspace = signal<string | undefined>(undefined);
    effort = signal<EffortLevel | undefined>('medium');
    setEffort = jest.fn();
    effortWrites(true);
    ultracodeEnabled = signal(false);
    ultracodeToggle = jest.fn(async (next: boolean) => {
      ultracodeEnabled.set(next);
      return true;
    });

    TestBed.configureTestingModule({
      imports: [AgentBehaviourSectionComponent],
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        { provide: ClaudeRpcService, useValue: { call } },
        { provide: WorkspaceScopeService, useValue: { activeWorkspacePath: workspace, generation: signal(0) } },
        {
          provide: EffortStateService,
          useValue: { currentEffort: effort, setEffort },
        },
        {
          provide: UltracodeStateService,
          useValue: { enabled: ultracodeEnabled, toggle: ultracodeToggle },
        },
        {
          provide: ProvidersSettingsStateService,
          useValue: { commit: signal({ status: 'idle' }) },
        },
        { provide: VSCodeService, useValue: { isElectron: true } },
        SettingsSaveFeedbackService,
        AdvancedOverviewStore,
      ],
    });
    feedback = TestBed.inject(SettingsSaveFeedbackService);
  });

  afterEach(() => {
    feedback.dismiss();
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('reports loaded agent behaviour and updates with effort and Ultracode', async () => {
    await render();
    const overview = TestBed.inject(AdvancedOverviewStore);
    expect(overview.segments()[1]).toMatchObject({
      value: 'Ultracode off', meta: 'Medium effort', tone: 'info',
    });
    effort.set('high');
    ultracodeEnabled.set(true);
    fixture.detectChanges();
    expect(overview.segments()[1]).toMatchObject({
      value: 'Ultracode on', meta: 'High effort', tone: 'info',
    });
  });

  it('keeps the overview idle when a status load fails', async () => {
    handlers['agent:getConfig'] = () => rpcError('unavailable');
    await render();
    expect(TestBed.inject(AdvancedOverviewStore).segments()[1]).toMatchObject({
      value: 'Not loaded', tone: 'idle',
    });
  });

  it('labels the shared effort select from the setting row', async () => {
    await render();
    const select = element.querySelector('ptah-select');
    expect(select?.getAttribute('data-testid')).toBe('agent-behaviour-effort-value');
    expect(select?.querySelector('button')?.getAttribute('aria-labelledby'))
      .toBe('agent-behaviour-effort-title');
    expect(element.querySelector('select')).toBeNull();
  });

  describe('card shape', () => {
    it('renders one Agent behaviour form section with the four rows in order', async () => {
      await render();
      expect(
        element.querySelector('section')?.getAttribute('data-glass-surface'),
      ).toBe('content');
      expect(
        element.querySelector('#agent-behaviour-heading')?.textContent?.trim(),
      ).toBe('Agent behaviour');
      const rows = Array.from(element.querySelectorAll('ptah-setting-row')).map(
        (row) => row.getAttribute('data-testid'),
      );
      expect(rows).toEqual([
        'agent-behaviour-row-prompt',
        'agent-behaviour-row-ultracode',
        'agent-behaviour-row-workflows',
        'agent-behaviour-row-effort',
      ]);
    });

    it('PR-1 and PR-2: neither the preset radios nor the paid-plan sentence render', async () => {
      await render();
      expect(element.querySelector('input[type="radio"]')).toBeNull();
      expect(element.textContent).not.toContain('Default for new sessions');
      expect(element.textContent).not.toContain('paid plan');
    });

    it('labels the effort cell as the Providers Main Agent effort (G9)', async () => {
      await render();
      const row = element.querySelector(
        '[data-testid="agent-behaviour-row-effort"]',
      );
      expect(row?.textContent).toContain('Chat reasoning effort');
      expect(row?.textContent).toContain(
        'Same value as Providers > Main Agent effort',
      );
    });

    it('deviation 6: colour classes sit only on icons, never on text', async () => {
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcError('status unavailable');
      await render();
      const coloured = Array.from(
        element.querySelectorAll(
          '.text-primary, .text-secondary, .text-success, .text-error, .text-warning',
        ),
      );
      // lucide-angular copies its host classes onto the inner <svg>.
      expect(
        coloured.every((node) => node.closest('lucide-angular') !== null),
      ).toBe(true);
    });
  });

  describe('System prompt mode (A10/A11)', () => {
    it('keeps the harness aria-label, links the hint via aria-describedby, and disables the toggle when no project prompt exists', async () => {
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: false, hasGeneratedPrompt: false });
      await render();
      const toggle = checkbox('Toggle Enhanced System Prompt');
      expect(toggle.checked).toBe(false);
      expect(isDisabledControl(toggle)).toBe(true);
      expect(toggle.getAttribute('aria-disabled')).toBe('true');
      expect(toggle.getAttribute('role')).toBe('switch');
      expect(toggle.getAttribute('aria-describedby')).toBe(
        'agent-behaviour-prompt-note',
      );
      expect(
        element.querySelector('#agent-behaviour-prompt-note')?.textContent?.trim(),
      ).toBe('Uses the Claude Code preset. Run Setup to generate the project prompt first.');

      call.mockClear();
      await click('Toggle Enhanced System Prompt');
      expect(call).not.toHaveBeenCalledWith(
        'enhancedPrompts:setEnabled',
        expect.anything(),
      );
    });

    it('cancels Space while leaving the disabled switch in the tab order', async () => {
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: false, hasGeneratedPrompt: false });
      await render();
      const toggle = checkbox('Toggle Enhanced System Prompt');
      expect(toggle.tabIndex).toBe(0);
      toggle.focus();
      expect(document.activeElement).toBe(toggle);
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      expect(toggle.dispatchEvent(tab)).toBe(true);
      const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      expect(toggle.dispatchEvent(space)).toBe(false);
      expect(space.defaultPrevented).toBe(true);
      expect(toggle.checked).toBe(false);
      expect(call).not.toHaveBeenCalledWith('enhancedPrompts:setEnabled', expect.anything());
    });

    it('invalidates A immediately when switching to B and drops a late read for A', async () => {
      workspace.set('/a');
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: true, hasGeneratedPrompt: true });
      await render();
      const toggle = checkbox('Toggle Enhanced System Prompt');
      expect(toggle.checked).toBe(true);

      let finishA: (status: unknown) => void = () => { throw new Error('A read never started'); };
      const lateA = new Promise((resolve) => { finishA = resolve; });
      handlers['enhancedPrompts:getStatus'] = (params) =>
        (params as { workspacePath: string }).workspacePath === '/a'
          ? lateA
          : rpcSuccess({ enabled: false, hasGeneratedPrompt: false });
      toggle.click(); // The acknowledged write starts a read-back for A.
      await settle();
      expect(call).toHaveBeenCalledWith('enhancedPrompts:setEnabled', { workspacePath: '/a', enabled: false });
      workspace.set('/b');
      expect(component.promptToggleDisabled()).toBe(true);
      expect(component.promptEnabled()).toBe(false);
      fixture.detectChanges();
      await settle();
      expect(toggle.checked).toBe(false);
      expect(isDisabledControl(toggle)).toBe(true);

      finishA(rpcSuccess({ enabled: true, hasGeneratedPrompt: true }));
      await settle();
      expect(toggle.checked).toBe(false);
      expect(isDisabledControl(toggle)).toBe(true);
      call.mockClear();
      await feedback.undo();
      expect(call).toHaveBeenCalledWith('enhancedPrompts:setEnabled', { workspacePath: '/a', enabled: true });
      expect(call).not.toHaveBeenCalledWith('enhancedPrompts:getStatus', expect.anything());
      expect(toggle.checked).toBe(false);
    });

    it('keeps the toggle off and disabled when hasGeneratedPrompt is false even if enabled is true', async () => {
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: true, hasGeneratedPrompt: false });
      await render();
      const toggle = checkbox('Toggle Enhanced System Prompt');
      expect(toggle.checked).toBe(false);
      expect(isDisabledControl(toggle)).toBe(true);
      expect(toggle.getAttribute('aria-disabled')).toBe('true');
      expect(
        element.querySelector('#agent-behaviour-prompt-note')?.textContent?.trim(),
      ).toBe('Uses the Claude Code preset. Run Setup to generate the project prompt first.');
    });

    it('shows loading hint and keeps toggle off and disabled while initial status is loading', async () => {
      let resolveStatus!: (value: unknown) => void;
      handlers['enhancedPrompts:getStatus'] = () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        });

      fixture = TestBed.createComponent(AgentBehaviourSectionComponent);
      component = fixture.componentInstance;
      element = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();

      const toggle = checkbox('Toggle Enhanced System Prompt');
      expect(toggle.checked).toBe(false);
      expect(isDisabledControl(toggle)).toBe(true);
      expect(toggle.getAttribute('aria-disabled')).toBe('true');
      expect(
        element.querySelector('#agent-behaviour-prompt-note')?.textContent?.trim(),
      ).toBe('Loading system prompt status…');

      toggle.click();
      fixture.detectChanges();
      expect(call).not.toHaveBeenCalledWith(
        'enhancedPrompts:setEnabled',
        expect.anything(),
      );

      resolveStatus(rpcSuccess({ enabled: true, hasGeneratedPrompt: true }));
      await settle();

      expect(toggle.checked).toBe(true);
      expect(isDisabledControl(toggle)).toBe(false);
      expect(toggle.getAttribute('aria-disabled')).toBeNull();
      expect(
        element.querySelector('#agent-behaviour-prompt-note')?.textContent?.trim(),
      ).toBe(
        "On: Ptah's own system prompt replaces the Claude Code preset. Applies to new sessions.",
      );
    });

    it('shows the on description when the project prompt exists and is enabled, and updates to the off description when turned off', async () => {
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: true, hasGeneratedPrompt: true });
      await render();

      const toggle = checkbox('Toggle Enhanced System Prompt');
      expect(toggle.checked).toBe(true);
      expect(isDisabledControl(toggle)).toBe(false);
      expect(
        element.querySelector('#agent-behaviour-prompt-note')?.textContent?.trim(),
      ).toBe(
        "On: Ptah's own system prompt replaces the Claude Code preset. Applies to new sessions.",
      );

      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: false, hasGeneratedPrompt: true });
      await click('Toggle Enhanced System Prompt');
      expect(call).toHaveBeenCalledWith('enhancedPrompts:setEnabled', {
        workspacePath: '.',
        enabled: false,
      });
      expect(toggle.checked).toBe(false);
      expect(
        element.querySelector('#agent-behaviour-prompt-note')?.textContent?.trim(),
      ).toBe(
        "Off: Claude Code preset with Ptah additions. Turn on to replace the preset with Ptah's prompt. Applies to new sessions.",
      );
    });

    it('shows the off description when the project prompt exists and is disabled', async () => {
      await render();
      const toggle = checkbox('Toggle Enhanced System Prompt');
      expect(toggle.checked).toBe(false);
      expect(isDisabledControl(toggle)).toBe(false);
      expect(
        element.querySelector('#agent-behaviour-prompt-note')?.textContent?.trim(),
      ).toBe(
        "Off: Claude Code preset with Ptah additions. Turn on to replace the preset with Ptah's prompt. Applies to new sessions.",
      );
    });

    it('saves on selection, re-reads the status and toasts with Undo', async () => {
      await render();
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: true, hasGeneratedPrompt: true });
      await click('Toggle Enhanced System Prompt');
      expect(call).toHaveBeenCalledWith('enhancedPrompts:setEnabled', {
        workspacePath: '.',
        enabled: true,
      });
      expect(checkbox('Toggle Enhanced System Prompt').checked).toBe(true);
      expect(
        element.querySelector('#agent-behaviour-prompt-note')?.textContent?.trim(),
      ).toBe(
        "On: Ptah's own system prompt replaces the Claude Code preset. Applies to new sessions.",
      );
      expect(
        element.querySelector('[data-testid="agent-behaviour-prompt-status"]')
          ?.textContent,
      ).toContain('Ptah Enhanced');
      expect(feedback.toast()).toEqual({
        tone: 'status',
        message: 'Saved system prompt mode.',
        canUndo: true,
      });

      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: false, hasGeneratedPrompt: true });
      await feedback.undo();
      expect(call).toHaveBeenLastCalledWith('enhancedPrompts:getStatus', {
        workspacePath: '.',
      });
      expect(call).toHaveBeenCalledWith('enhancedPrompts:setEnabled', {
        workspacePath: '.',
        enabled: false,
      });
    });

    it('writes the mode for the active workspace root, not ".", when the host tracks one', async () => {
      workspace.set('/ws/project-a');
      await render();
      await click('Toggle Enhanced System Prompt');
      expect(call).toHaveBeenCalledWith('enhancedPrompts:setEnabled', {
        workspacePath: '/ws/project-a',
        enabled: true,
      });
    });

    it('D15: a failed write reverts the checkbox and raises an alert toast with fixed message', async () => {
      handlers['enhancedPrompts:setEnabled'] = () =>
        rpcError('host detail: disk full');
      await render();
      await click('Toggle Enhanced System Prompt');
      expect(checkbox('Toggle Enhanced System Prompt').checked).toBe(false);
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message: 'Could not save the system prompt mode.',
        canUndo: false,
      });
      expect(feedback.toast()?.message).not.toContain('host detail');
    });

    it('D15: a host failure inside a successful RPC ({success:false}) uses fixed error message', async () => {
      handlers['enhancedPrompts:setEnabled'] = () =>
        rpcSuccess({
          success: false,
          error: 'host detail: Enhanced prompts could not be enabled.',
        });
      await render();
      call.mockClear();
      await click('Toggle Enhanced System Prompt');
      expect(checkbox('Toggle Enhanced System Prompt').checked).toBe(false);
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message: 'Could not save the system prompt mode.',
        canUndo: false,
      });
      expect(feedback.toast()?.message).not.toContain('host detail');
      // No status re-read follows a failed write.
      expect(call).not.toHaveBeenCalledWith('enhancedPrompts:getStatus', {
        workspacePath: '.',
      });
    });

    it('D15: a thrown error during write uses fixed error message', async () => {
      handlers['enhancedPrompts:setEnabled'] = () => {
        throw new Error('host detail: catastrophic crash');
      };
      await render();
      await click('Toggle Enhanced System Prompt');
      expect(checkbox('Toggle Enhanced System Prompt').checked).toBe(false);
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message: 'Could not save the system prompt mode.',
        canUndo: false,
      });
      expect(feedback.toast()?.message).not.toContain('host detail');
    });

    it('shows a load failure as an inline alert with fixed copy and no host detail', async () => {
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcError('host detail: status unavailable');
      await render();
      const toggle = checkbox('Toggle Enhanced System Prompt');
      expect(toggle.checked).toBe(false);
      expect(isDisabledControl(toggle)).toBe(true);
      expect(toggle.getAttribute('aria-disabled')).toBe('true');
      expect(toggle.getAttribute('aria-describedby')).toBe(
        'agent-behaviour-prompt-note',
      );
      expect(
        element.querySelector('#agent-behaviour-prompt-note')?.textContent?.trim(),
      ).toBe('The system prompt status is not loaded yet.');
      const alert = element.querySelector(
        '[data-testid="agent-behaviour-load-error"]',
      );
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.textContent).toContain(
        'Could not load the system prompt status.',
      );
      expect(alert?.textContent).not.toContain('host detail');
    });

    it('shows a load thrown error as an inline alert with fixed copy and no host detail', async () => {
      handlers['enhancedPrompts:getStatus'] = () => {
        throw new Error('host detail: socket timeout');
      };
      await render();
      const alert = element.querySelector(
        '[data-testid="agent-behaviour-load-error"]',
      );
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.textContent).toContain(
        'Could not load the system prompt status.',
      );
      expect(alert?.textContent).not.toContain('host detail');
    });

    it('lane Serious 1: a status with error inside a successful RPC is a load failure with Retry, not the wizard note', async () => {
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({
          enabled: false,
          hasGeneratedPrompt: false,
          generatedAt: null,
          error: 'host detail: EPERM',
        });
      await render();

      const alert = element.querySelector(
        '[data-testid="agent-behaviour-load-error"]',
      );
      expect(alert?.textContent).toContain(
        'Could not load the system prompt status.',
      );
      expect(alert?.textContent).not.toContain('EPERM');
      const note =
        element.querySelector('#agent-behaviour-prompt-note')?.textContent ??
        '';
      expect(note).not.toContain('Run Setup');
      expect(note).toContain('not loaded');

      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: true, hasGeneratedPrompt: true });
      element
        .querySelector<HTMLButtonElement>(
          '[data-testid="agent-behaviour-load-retry"]',
        )
        ?.click();
      await settle();

      expect(
        element.querySelector('[data-testid="agent-behaviour-load-error"]'),
      ).toBeNull();
      expect(checkbox('Toggle Enhanced System Prompt').checked).toBe(true);
    });

    it('Moderate 8 / FM-3: a saved mode whose re-read fails keeps the written value and shows the load error', async () => {
      await render();
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcError('host detail: read failed');
      await click('Toggle Enhanced System Prompt');

      expect(feedback.toast()).toEqual({
        tone: 'status',
        message: 'Saved system prompt mode.',
        canUndo: true,
      });
      expect(checkbox('Toggle Enhanced System Prompt').checked).toBe(true);
      expect(
        element.querySelector('[data-testid="agent-behaviour-prompt-status"]')
          ?.textContent,
      ).toContain('Ptah Enhanced');
      expect(
        element.querySelector('[data-testid="agent-behaviour-load-error"]')
          ?.textContent,
      ).toContain('Could not load the system prompt status.');
    });

    it('D2: "Applies to new sessions" uses the muted token without extra opacity', async () => {
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcSuccess({ enabled: true, hasGeneratedPrompt: true });
      await render();
      const status = element.querySelector(
        '[data-testid="agent-behaviour-prompt-status"]',
      );
      expect(status?.textContent).toContain('Applies to new sessions');
      expect(status?.closest('[class*="opacity-"]')).toBeNull();
    });
  });

  describe('row descriptions (F9)', () => {
    it('shows every description as the wrapping row hint and keeps its id', async () => {
      await render();
      const notes = ['prompt', 'effort', 'workflows', 'ultracode'].map(
        (row) =>
          element.querySelector(`#agent-behaviour-${row}-note`) as HTMLElement,
      );
      for (const note of notes) {
        expect(note.tagName).toBe('P');
        expect(note.classList).not.toContain('truncate');
        expect(note.hasAttribute('title')).toBe(false);
        expect(note.textContent?.trim()).not.toBe('');
        expect(note.closest('ptah-setting-row')).not.toBeNull();
      }
      expect(notes[3].textContent).toContain('Plan each message with X-High effort.');
      expect(
        checkbox('Toggle Ultracode mode').getAttribute('aria-describedby'),
      ).toBe('agent-behaviour-ultracode-note');
      expect(
        checkbox('Toggle dynamic workflows').getAttribute('aria-describedby'),
      ).toBe('agent-behaviour-workflows-note');
    });
  });

  describe('Chat reasoning effort (A26, read-back)', () => {
    it('shows the shared effort value on the cell button', async () => {
      await render();
      expect(
        element.querySelector('[data-testid="agent-behaviour-effort-value"]')
          ?.textContent,
      ).toContain('Medium');
    });

    it('saves a new level and Undo writes the previous one back', async () => {
      await render();
      await component.selectEffort('high');
      expect(setEffort).toHaveBeenCalledWith('high');
      expect(feedback.toast()).toEqual({
        tone: 'status',
        message: 'Saved chat reasoning effort.',
        canUndo: true,
      });

      await feedback.undo();
      expect(setEffort).toHaveBeenLastCalledWith('medium');
      expect(effort()).toBe('medium');
    });

    it('writes undefined (SDK default) for the Default choice', async () => {
      await render();
      await component.selectEffort('');
      expect(setEffort).toHaveBeenCalledWith(undefined);
      expect(feedback.toast()?.tone).toBe('status');
    });

    it('D15: a write that setEffort rolled back is never toasted as saved', async () => {
      effortWrites(false);
      await render();
      await component.selectEffort('max');
      expect(effort()).toBe('medium');
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message: 'Could not save the chat reasoning effort.',
        canUndo: false,
      });
    });

    it('does not write when the current level is picked again', async () => {
      await render();
      await component.selectEffort('medium');
      expect(setEffort).not.toHaveBeenCalled();
      expect(feedback.toast()).toBeNull();
    });

    it('is pinned while Ultracode is on: the cell is disabled and says why', async () => {
      ultracodeEnabled.set(true);
      await render();
      const trigger = element.querySelector<HTMLButtonElement>(
        '[data-testid="agent-behaviour-effort-value"]',
      );
      expect(isDisabledControl(trigger?.querySelector('button'))).toBe(true);
      expect(
        element.querySelector('#agent-behaviour-effort-note')?.textContent,
      ).toContain('Pinned to X-High by Ultracode');
    });
  });

  describe('Dynamic workflows (A27)', () => {
    it('hydrates from agent:getConfig', async () => {
      handlers['agent:getConfig'] = () =>
        rpcSuccess({ workflowsDisabled: true });
      await render();
      expect(checkbox('Toggle dynamic workflows').checked).toBe(false);
      expect(
        element
          .querySelector('[data-testid="agent-behaviour-workflows-status"]')
          ?.textContent?.trim(),
      ).toBe('Off');
    });

    it('persists the inverted flag and toasts with Undo', async () => {
      await render();
      await click('Toggle dynamic workflows');
      expect(call).toHaveBeenCalledWith('agent:setConfig', {
        workflowsDisabled: true,
      });
      expect(checkbox('Toggle dynamic workflows').checked).toBe(false);
      expect(feedback.toast()).toEqual({
        tone: 'status',
        message: 'Saved dynamic workflows.',
        canUndo: true,
      });

      await feedback.undo();
      expect(call).toHaveBeenLastCalledWith('agent:setConfig', {
        workflowsDisabled: false,
      });
      expect(component.workflowsEnabled()).toBe(true);
    });

    it('D15: a structured failure reverts the checkbox and uses fixed message with no host detail', async () => {
      handlers['agent:setConfig'] = () =>
        rpcSuccess({
          success: false,
          error: 'host detail: Settings file is read-only.',
        });
      await render();
      await click('Toggle dynamic workflows');
      expect(checkbox('Toggle dynamic workflows').checked).toBe(true);
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message: 'Could not save the dynamic workflows setting.',
        canUndo: false,
      });
      expect(feedback.toast()?.message).not.toContain('host detail');
    });

    it('D15: a thrown error during workflow write uses fixed message with no host detail', async () => {
      handlers['agent:setConfig'] = () => {
        throw new Error('host detail: IPC disconnected');
      };
      await render();
      await click('Toggle dynamic workflows');
      expect(checkbox('Toggle dynamic workflows').checked).toBe(true);
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message: 'Could not save the dynamic workflows setting.',
        canUndo: false,
      });
      expect(feedback.toast()?.message).not.toContain('host detail');
    });

    it('keeps the toggle disabled and reports the failure when the setting cannot load', async () => {
      handlers['agent:getConfig'] = () => rpcError('host detail: host offline');
      await render();
      expect(isDisabledControl(checkbox('Toggle dynamic workflows'))).toBe(
        true,
      );
      const alert = element.querySelector(
        '[data-testid="agent-behaviour-load-error"]',
      );
      expect(alert?.textContent).toContain(
        'Could not load the dynamic workflows setting.',
      );
      expect(alert?.textContent).not.toContain('host detail');

      handlers['agent:getConfig'] = () =>
        rpcSuccess({ workflowsDisabled: false });
      alert
        ?.querySelector<HTMLButtonElement>(
          '[data-testid="agent-behaviour-load-retry"]',
        )
        ?.click();
      await settle();
      expect(isDisabledControl(checkbox('Toggle dynamic workflows'))).toBe(
        false,
      );
      expect(
        element.querySelector('[data-testid="agent-behaviour-load-error"]'),
      ).toBeNull();
    });

    it('keeps the toggle disabled and reports the failure when the setting load throws', async () => {
      handlers['agent:getConfig'] = () => {
        throw new Error('host detail: connection refused');
      };
      await render();
      expect(isDisabledControl(checkbox('Toggle dynamic workflows'))).toBe(
        true,
      );
      const alert = element.querySelector(
        '[data-testid="agent-behaviour-load-error"]',
      );
      expect(alert?.textContent).toContain(
        'Could not load the dynamic workflows setting.',
      );
      expect(alert?.textContent).not.toContain('host detail');
    });
  });

  describe('Ultracode (A29)', () => {
    it('turns on through UltracodeStateService and Undo turns it back off', async () => {
      await render();
      await click('Toggle Ultracode mode');
      expect(ultracodeToggle).toHaveBeenCalledWith(true);
      expect(feedback.toast()).toEqual({
        tone: 'status',
        message: 'Saved Ultracode.',
        canUndo: true,
      });

      await feedback.undo();
      expect(ultracodeToggle).toHaveBeenLastCalledWith(false);
      expect(ultracodeEnabled()).toBe(false);
    });

    it('D15: a failed restore of the previous effort keeps Ultracode on and alerts', async () => {
      ultracodeEnabled.set(true);
      ultracodeToggle.mockResolvedValueOnce(false);
      await render();
      await click('Toggle Ultracode mode');
      expect(checkbox('Toggle Ultracode mode').checked).toBe(true);
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message:
          'Could not turn off Ultracode: your previous reasoning effort was not restored.',
        canUndo: false,
      });
    });

    it('D15: a failed pin keeps Ultracode off and alerts', async () => {
      ultracodeToggle.mockResolvedValueOnce(false);
      await render();
      await click('Toggle Ultracode mode');
      expect(checkbox('Toggle Ultracode mode').checked).toBe(false);
      expect(feedback.toast()?.tone).toBe('alert');
    });
  });

  describe('row layout (F3, F4, decision 29)', () => {
    it('aligns each control to the right edge, trims the edge padding and has no row border class', async () => {
      await render();
      const rows = Array.from(element.querySelectorAll<HTMLElement>('ptah-setting-row'));
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(row.className).not.toContain('border-bottom');
        expect(row.classList).toContain('first:[&>div]:pt-0');
        expect(row.classList).toContain('last:[&>div]:pb-0');
        expect(row.querySelector('[data-ptah-setting-control]')?.classList).toContain('justify-end');
      }
      expect(element.querySelector('[data-testid="form-section-icon"]')).not.toBeNull();
    });

    it('keeps the four rows in one container with the load alerts outside it (review minor 2)', async () => {
      handlers['enhancedPrompts:getStatus'] = () =>
        rpcError('status unavailable');
      await render();
      const rows = element.querySelector<HTMLElement>('[data-testid="agent-behaviour-rows"]');
      expect(rows).not.toBeNull();
      expect(Array.from(rows?.children ?? []).map((row) => row.tagName.toLowerCase())).toEqual(
        Array(4).fill('ptah-setting-row'),
      );
      expect(rows?.firstElementChild?.getAttribute('data-testid')).toBe('agent-behaviour-row-prompt');
      expect(rows?.lastElementChild?.getAttribute('data-testid')).toBe('agent-behaviour-row-effort');
      const alert = element.querySelector('[data-testid="agent-behaviour-load-error"]');
      expect(alert).not.toBeNull();
      expect(rows?.contains(alert)).toBe(false);
    });

    it('puts the details and info buttons in the action slot and the toggle after it', async () => {
      await render();
      const slot = (row: string): HTMLElement | null =>
        element.querySelector(`[data-testid="agent-behaviour-row-${row}"] [data-ptah-setting-action]`);
      expect(slot('prompt')?.querySelector('[aria-label="System prompt details"]')).not.toBeNull();
      expect(slot('ultracode')?.querySelector('[aria-label="About Ultracode"]')).not.toBeNull();
      expect(slot('workflows')?.children).toHaveLength(0);
      expect(slot('prompt')?.querySelector('input')).toBeNull();
      expect(slot('prompt')?.nextElementSibling).toBe(checkbox('Toggle Enhanced System Prompt'));
    });
  });

  describe('Ultracode info popover (A14)', () => {
    afterEach(() => element?.remove());

    it('opens and closes from the action slot button; Esc closes it and focus is on the button', async () => {
      await render();
      document.body.appendChild(element);
      const info = element.querySelector<HTMLButtonElement>('[aria-label="About Ultracode"]');
      expect(info).not.toBeNull();
      expect(info?.closest('[data-ptah-setting-action]')).not.toBeNull();

      info?.focus();
      info?.click();
      fixture.detectChanges();
      expect(component.ultracodeInfoOpen()).toBe(true);
      expect(
        document.querySelector('[data-testid="agent-behaviour-ultracode-info-text"]')?.textContent,
      ).toContain('Turning Ultracode off restores your previous reasoning effort.');

      info?.click();
      fixture.detectChanges();
      expect(component.ultracodeInfoOpen()).toBe(false);

      info?.click();
      fixture.detectChanges();
      expect(component.ultracodeInfoOpen()).toBe(true);
      info?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.ultracodeInfoOpen()).toBe(false);
      expect(document.activeElement).toBe(info);
    });
  });

  describe('System prompt details drawer (D-SP)', () => {
    it('opens drawer when Details button is clicked', async () => {
      await render();
      expect(component.drawerOpen()).toBe(false);

      const detailsBtn = element.querySelector<HTMLButtonElement>(
        '[aria-label="System prompt details"]',
      );
      expect(detailsBtn).not.toBeNull();
      expect(detailsBtn?.getAttribute('data-testid')).toBe('agent-behaviour-prompt-details');
      detailsBtn?.click();
      fixture.detectChanges();

      expect(component.drawerOpen()).toBe(true);
    });

    async function openDrawer(): Promise<void> {
      element.querySelector<HTMLButtonElement>('[aria-label="System prompt details"]')?.click();
      fixture.detectChanges();
      const [block] = await fixture.getDeferBlocks();
      await block.render(DeferBlockState.Complete);
      await settle();
    }

    it.each(['generation completion', 'drawer reopen'])(
      'refreshes the mounted row on %s',
      async (trigger) => {
        workspace.set('/project');
        let generated = false;
        handlers['enhancedPrompts:getStatus'] = () =>
          rpcSuccess({
            enabled: generated,
            hasGeneratedPrompt: generated,
            generatedAt: generated ? '2026-10-02T09:00:00.000Z' : null,
            regenerationStartedAt: !generated && trigger === 'generation completion'
              ? '2026-10-02T08:59:00.000Z'
              : null,
          });
        await render();
        const toggle = checkbox('Toggle Enhanced System Prompt');
        await openDrawer();
        expect(isDisabledControl(toggle)).toBe(true);
        expect(toggle.checked).toBe(false);
        call.mockClear();

        if (trigger === 'generation completion') {
          // NativeDrawer renders the dialog in the CDK overlay outside the fixture root.
          const checkAgain = document.querySelector<HTMLButtonElement>(
            '[role="dialog"][aria-label="System prompt details"] [data-testid="regenerate-check-again"]',
          );
          expect(checkAgain).not.toBeNull();
          expect(checkAgain?.disabled).toBe(false);
          generated = true;
          checkAgain?.click();
          await settle();
        } else {
          component.drawerOpen.set(false);
          fixture.detectChanges();
          generated = true;
          await openDrawer();
        }

        expect(call).toHaveBeenCalledWith('enhancedPrompts:getStatus', { workspacePath: '/project' });
        expect(isDisabledControl(toggle)).toBe(false);
        expect(toggle.checked).toBe(true);
      },
    );
  });
});
