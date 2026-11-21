import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ProvidersSettingsStateService,
  type ProvidersSettingsCommit,
  type ProvidersSettingsSection,
} from '@ptah-extension/core';
import type { CliDetectionResult } from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { isDisabledControl } from '../feedback/busy-disabled.testing';
import { LanesRedetectButtonComponent } from './lanes-redetect-button.component';

const HOST_ERROR =
  'EACCES: permission denied, open /home/user/.config/settings.json';

class StateStub {
  /** Read by the page toast of `SettingsSaveFeedbackService`. */
  readonly commit = signal<ProvidersSettingsCommit>({
    status: 'idle',
    saved: [],
    unsaved: [],
    unconfirmed: [],
    refreshFailed: false,
    message: null,
  });
  readonly cliDetection = signal<
    ProvidersSettingsSection<CliDetectionResult[]>
  >({ status: 'unloaded', data: null, error: null });
  readonly redetectClis = jest.fn(async (): Promise<boolean> => {
    this.cliDetection.set({ status: 'ready', data: [], error: null });
    return true;
  });
}

describe('LanesRedetectButtonComponent', () => {
  let fixture: ComponentFixture<LanesRedetectButtonComponent>;
  let state: StateStub;
  let feedback: SettingsSaveFeedbackService;
  const element = () => fixture.nativeElement as HTMLElement;
  const button = (testid = 'policy-redetect') =>
    element().querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`);
  async function flush() {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    fixture.detectChanges();
  }

  beforeEach(() => {
    state = new StateStub();
    TestBed.configureTestingModule({
      imports: [LanesRedetectButtonComponent],
      providers: [
        { provide: ProvidersSettingsStateService, useValue: state },
        SettingsSaveFeedbackService,
      ],
    });
    feedback = TestBed.inject(SettingsSaveFeedbackService);
    fixture = TestBed.createComponent(LanesRedetectButtonComponent);
    fixture.detectChanges();
  });
  afterEach(() => {
    feedback.dismiss();
    TestBed.resetTestingModule();
  });

  it('is an icon-only button with the label "Re-detect CLIs" and the default test id', () => {
    expect(button()?.getAttribute('aria-label')).toBe('Re-detect CLIs');
    expect(button()?.textContent?.trim()).toBe('');
    expect(button()?.querySelector('lucide-angular')).not.toBeNull();
    expect(button()?.type).toBe('button');
  });

  it('takes the test id of its place', () => {
    fixture.componentRef.setInput('testId', 'lanes-strip-redetect');
    fixture.detectChanges();
    expect(button()).toBeNull();
    expect(button('lanes-strip-redetect')).not.toBeNull();
  });

  it('re-detects through the state and announces completion', async () => {
    button()?.click();
    await flush();
    expect(state.redetectClis).toHaveBeenCalledTimes(1);
    expect(feedback.toast()).toEqual({
      tone: 'status',
      message: 'CLI agents re-detected.',
      canUndo: false,
    });
  });

  it('is disabled with a spinner while detection runs, and a click starts no second detection', () => {
    state.cliDetection.set({ status: 'loading', data: null, error: null });
    fixture.detectChanges();
    expect(isDisabledControl(button())).toBe(true);
    expect(button()?.querySelector('lucide-angular')?.className).toContain(
      'animate-spin',
    );
    button()?.click();
    expect(state.redetectClis).not.toHaveBeenCalled();
  });

  it('shows the spinner while its own detection is in flight', async () => {
    let finish: (ok: boolean) => void = () => undefined;
    state.redetectClis.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    button()?.click();
    fixture.detectChanges();
    expect(isDisabledControl(button())).toBe(true);
    button()?.click();
    expect(state.redetectClis).toHaveBeenCalledTimes(1);
    finish(true);
    await flush();
    expect(isDisabledControl(button())).toBe(false);
    expect(button()?.querySelector('lucide-angular')?.className).not.toContain(
      'animate-spin',
    );
  });

  it.each([
    [
      'a failed detection',
      async (s: StateStub) => {
        s.cliDetection.set({
          status: 'error',
          data: null,
          error:
            HOST_ERROR as string as ProvidersSettingsSection<unknown>['error'],
        });
        return false;
      },
    ],
    [
      'a failed detection while an overlapping one left the section ready',
      async () => false,
    ],
    [
      'a thrown command',
      async () => {
        throw new Error(HOST_ERROR);
      },
    ],
  ])(
    'announces a fixed sentence after %s, never the host text',
    async (_label, run) => {
      state.redetectClis.mockImplementation(() => run(state));
      button()?.click();
      await flush();
      expect(feedback.toast()).toEqual({
        tone: 'alert',
        message:
          'Could not re-detect CLI agents. Your saved settings have not changed.',
        canUndo: false,
      });
      expect(element().textContent).not.toContain('EACCES');
      expect(isDisabledControl(button())).toBe(false);
    },
  );
});
