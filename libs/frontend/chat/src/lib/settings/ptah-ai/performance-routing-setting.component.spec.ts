import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ClaudeRpcService,
  ProvidersSettingsStateService,
} from '@ptah-extension/core';
import { rpcError, rpcSuccess } from '@ptah-extension/core/testing';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { PerformanceRoutingSettingComponent } from './performance-routing-setting.component';

const KEY = 'agentOrchestration.performanceRouting';
const OPTIONS = { timeout: 5_000 };

describe('PerformanceRoutingSettingComponent', () => {
  let fixture: ComponentFixture<PerformanceRoutingSettingComponent>;
  const call = jest.fn();
  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const toggle = () =>
    root().querySelector<HTMLInputElement>('#performance-routing-toggle');

  beforeEach(() => {
    call.mockReset();
    TestBed.configureTestingModule({
      imports: [PerformanceRoutingSettingComponent],
      providers: [
        { provide: ClaudeRpcService, useValue: { call } },
        {
          provide: ProvidersSettingsStateService,
          useValue: { commit: signal({ status: 'idle' }) },
        },
        SettingsSaveFeedbackService,
      ],
    });
  });

  async function settle(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(PerformanceRoutingSettingComponent);
    fixture.detectChanges();
    await settle();
  }

  it.each([
    { value: undefined, checked: true },
    { value: null, checked: true },
    { value: false, checked: false },
    { value: true, checked: true },
  ])('loads $value as checked=$checked', async ({ value, checked }) => {
    call.mockResolvedValueOnce(rpcSuccess({ success: true, value }));

    await create();

    expect(call).toHaveBeenCalledWith('settings:get', { key: KEY }, OPTIONS);
    expect(toggle()?.checked).toBe(checked);
  });

  it('keeps the old value visible until read-back confirms the write', async () => {
    const result = rpcSuccess({ success: true, value: false });
    let finishRead!: (reply: typeof result) => void;
    call
      .mockResolvedValueOnce(rpcSuccess({ success: true, value: true }))
      .mockResolvedValueOnce(rpcSuccess({ success: true }))
      .mockImplementationOnce(
        () => new Promise<typeof result>((resolve) => {
          finishRead = resolve;
        }),
      );
    await create();

    toggle()?.click();
    await settle();
    expect(call).toHaveBeenNthCalledWith(
      2, 'settings:set', { key: KEY, value: false }, OPTIONS,
    );
    expect(call).toHaveBeenNthCalledWith(3, 'settings:get', { key: KEY }, OPTIONS);
    expect(toggle()?.checked).toBe(true);
    expect(toggle()?.getAttribute('aria-disabled')).toBe('true');

    finishRead(result);
    await settle();

    expect(toggle()?.checked).toBe(false);
    expect(toggle()?.getAttribute('aria-disabled')).toBeNull();
    const feedback = TestBed.inject(SettingsSaveFeedbackService);
    expect(feedback.toast()).toMatchObject({
      tone: 'status',
      canUndo: true,
    });

    call
      .mockResolvedValueOnce(rpcSuccess({ success: true }))
      .mockResolvedValueOnce(rpcSuccess({ success: true, value: true }));
    await feedback.undo();
    await settle();

    expect(call).toHaveBeenNthCalledWith(
      4, 'settings:set', { key: KEY, value: true }, OPTIONS,
    );
    expect(call).toHaveBeenNthCalledWith(5, 'settings:get', { key: KEY }, OPTIONS);
    expect(toggle()?.checked).toBe(true);
  });

  it.each([
    { reply: rpcError('write refused'), scenario: 'is rejected' },
    { reply: rpcSuccess({ success: true }), scenario: 'is acknowledged without persisting' },
  ])('keeps the read-back value when the write $scenario', async ({ reply }) => {
    call
      .mockResolvedValueOnce(rpcSuccess({ success: true, value: true }))
      .mockResolvedValueOnce(reply)
      .mockResolvedValueOnce(rpcSuccess({ success: true, value: true }));
    await create();

    toggle()?.click();
    await settle();

    expect(call).toHaveBeenNthCalledWith(3, 'settings:get', { key: KEY }, OPTIONS);
    expect(toggle()?.checked).toBe(true);
    expect(TestBed.inject(SettingsSaveFeedbackService).toast()).toMatchObject({
      tone: 'alert',
      message: expect.stringContaining('The switch shows the saved value.'),
    });
  });

  it('reports a failed read-back and lets the user retry', async () => {
    call
      .mockResolvedValueOnce(rpcSuccess({ success: true, value: true }))
      .mockResolvedValueOnce(rpcSuccess({ success: true }))
      .mockResolvedValueOnce(rpcError('host offline'))
      .mockResolvedValueOnce(rpcSuccess({ success: true, value: false }));
    await create();

    toggle()?.click();
    await settle();

    expect(toggle()).toBeNull();
    expect(root().textContent).toContain('Performance routing could not be read.');
    expect(TestBed.inject(SettingsSaveFeedbackService).toast()?.tone).toBe('alert');
    root().querySelector<HTMLButtonElement>('ptah-alert button')?.click();
    await settle();
    expect(toggle()?.checked).toBe(false);
  });
});
