import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ProvidersSettingsStateService,
  type ProvidersOrchestration,
  type ProvidersSettingsCommit,
  type ProvidersSettingsPatch,
  type ProvidersSettingsSection,
} from '@ptah-extension/core';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { isDisabledControl } from '../feedback/busy-disabled.testing';
import { LanesMaxConcurrentComponent } from './lanes-max-concurrent.component';

const ready = <T>(data: T): ProvidersSettingsSection<T> => ({
  status: 'ready',
  data,
  error: null,
});
const unloaded = <T>(): ProvidersSettingsSection<T> => ({
  status: 'unloaded',
  data: null,
  error: null,
});
const idle: ProvidersSettingsCommit = {
  status: 'idle',
  saved: [],
  unsaved: [],
  unconfirmed: [],
  refreshFailed: false,
  message: null,
};
const CONTEXT = { scopeKey: 'workspace', activePath: '/ws' };
const ORCHESTRATION = { maxConcurrentAgents: 3 } as ProvidersOrchestration;

/** The shared state: `saveSettings` applies the patch and records a `saved` commit, like a confirmed read-back. */
class StateStub {
  readonly commit = signal<ProvidersSettingsCommit>(idle);
  readonly orchestration = signal<
    ProvidersSettingsSection<ProvidersOrchestration>
  >(ready(ORCHESTRATION));
  readonly scopes = signal<
    ProvidersSettingsSection<{ activePath: string; entries: unknown[] }>
  >(ready({ activePath: '/ws', entries: [] }));
  readonly reviewContext = jest.fn(() =>
    this.scopes().status === 'ready' ? CONTEXT : null,
  );
  /** `false` makes the next writes fail without changing the saved values. */
  persist = true;
  readonly saveSettings = jest.fn(
    async (patch: ProvidersSettingsPatch, _context: unknown) => {
      if (!this.persist) {
        this.commit.set({
          ...idle,
          status: 'failed',
          unsaved: ['Orchestration policy'],
          message: 'Nothing was saved.',
        });
        return true;
      }
      const data = this.orchestration().data;
      if (data)
        this.orchestration.set(
          ready({ ...data, ...patch.orchestration } as ProvidersOrchestration),
        );
      this.commit.set({
        ...idle,
        status: 'saved',
        saved: ['Orchestration policy'],
      });
      return true;
    },
  );
}

describe('LanesMaxConcurrentComponent', () => {
  let fixture: ComponentFixture<LanesMaxConcurrentComponent>;
  let state: StateStub;
  let feedback: SettingsSaveFeedbackService;
  const element = () => fixture.nativeElement as HTMLElement;
  const field = () =>
    element().querySelector<HTMLInputElement>(
      '[data-testid="policy-max-concurrent-input"]',
    );
  const value = () => field()?.value;
  async function flush() {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    fixture.detectChanges();
  }
  function commit(to: number, event: 'input' | 'change') {
    const input = field();
    if (!input) throw new Error('No input');
    input.value = String(to);
    input.dispatchEvent(new Event(event));
  }

  beforeEach(() => {
    state = new StateStub();
    TestBed.configureTestingModule({
      imports: [LanesMaxConcurrentComponent],
      providers: [
        { provide: ProvidersSettingsStateService, useValue: state },
        SettingsSaveFeedbackService,
      ],
    });
    feedback = TestBed.inject(SettingsSaveFeedbackService);
    fixture = TestBed.createComponent(LanesMaxConcurrentComponent);
    fixture.detectChanges();
  });
  afterEach(() => {
    feedback.dismiss();
    TestBed.resetTestingModule();
  });

  it('is a labelled 1-100 integer number input showing the saved value', () => {
    expect(field()?.type).toBe('number');
    expect(field()?.min).toBe('1');
    expect(field()?.max).toBe('100');
    expect(field()?.step).toBe('1');
    expect(field()?.valueAsNumber).toBe(3);
    expect(value()).toBe('3');
    expect(field()?.getAttribute('aria-label')).toContain('Max concurrent');
    expect(field()?.id).toBe('lanes-max-concurrent');
    const label = element().querySelector('label[for="lanes-max-concurrent"]');
    expect(label?.textContent).toContain('Max concurrent');
    expect(
      label?.querySelector('lucide-angular')?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(field()?.className).toContain('w-20');
  });

  it('saves nothing until the value is committed', () => {
    commit(7, 'input');
    fixture.detectChanges();
    expect(state.saveSettings).not.toHaveBeenCalled();
  });

  it('saves on commit through the state, with a toast and an Undo that writes the previous value', async () => {
    commit(7, 'change');
    await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { maxConcurrentAgents: 7 } },
      CONTEXT,
    );
    expect(value()).toBe('7');
    expect(feedback.toast()).toEqual({
      tone: 'status',
      message: 'Saved max concurrent agents to All Ptah apps.',
      canUndo: true,
    });
    await feedback.undo();
    await flush();
    expect(state.saveSettings).toHaveBeenLastCalledWith(
      { orchestration: { maxConcurrentAgents: 3 } },
      CONTEXT,
    );
    expect(value()).toBe('3');
  });

  it.each([
    [100, 100],
    [250, 100],
    [0, 1],
    [-4, 1],
    [7.6, 8],
  ])('commits %s as %s (rounded, clamped to 1-100)', async (typed, saved) => {
    commit(typed, 'change');
    await flush();
    expect(state.saveSettings).toHaveBeenCalledWith(
      { orchestration: { maxConcurrentAgents: saved } },
      CONTEXT,
    );
  });

  it('keeps the previous value when the field is emptied', async () => {
    const input = field();
    if (!input) throw new Error('No input');
    input.value = '';
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(state.saveSettings).not.toHaveBeenCalled();
    expect(input.value).toBe('3');
  });

  it('a failed save shows the saved value again and an alert, never "Saved"', async () => {
    state.persist = false;
    commit(9, 'change');
    await flush();
    expect(value()).toBe('3');
    expect(field()?.valueAsNumber).toBe(3);
    expect(feedback.toast()?.tone).toBe('alert');
    expect(feedback.toast()?.message).toContain(
      'Could not save max concurrent agents.',
    );
  });

  it('writes nothing when committed on the saved value or before the state is read', async () => {
    commit(3, 'change');
    await flush();
    expect(state.saveSettings).not.toHaveBeenCalled();
    state.orchestration.set(unloaded());
    fixture.detectChanges();
    expect(value()).toBe('');
    expect(isDisabledControl(field())).toBe(true);
  });

  it('is disabled while the scope is not read, and writes nothing then', async () => {
    state.scopes.set(unloaded());
    fixture.detectChanges();
    expect(isDisabledControl(field())).toBe(true);
    commit(9, 'change');
    await flush();
    expect(state.saveSettings).not.toHaveBeenCalled();
  });
});
