import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { PermissionRequest } from '@ptah-extension/shared';
import { RemoteApprovalBlockComponent } from './remote-approval-block.component';

const NOW = 1_700_000_000_000;

function request(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: 'p1',
    toolName: 'Bash',
    toolInput: { command: 'ls -la' },
    timestamp: NOW,
    description: 'Run ls',
    timeoutAt: NOW + 60_000,
    ...overrides,
  };
}

function setup(
  inputs: Record<string, unknown> = {},
): ComponentFixture<RemoteApprovalBlockComponent> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [RemoteApprovalBlockComponent] });
  const fixture = TestBed.createComponent(RemoteApprovalBlockComponent);
  fixture.componentRef.setInput('request', request());
  fixture.componentRef.setInput('machineName', 'Horus');
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  return fixture;
}

const q = (fixture: ComponentFixture<unknown>, id: string) =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${id}"]`,
  );
const button = (fixture: ComponentFixture<unknown>, id: string) =>
  q(fixture, id) as HTMLButtonElement | null;

/** Intervals started and not yet cleared: Angular's own timeouts do not count. */
const activeIntervals = new Set<unknown>();

describe('RemoteApprovalBlockComponent', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    activeIntervals.clear();
    const realSet = globalThis.setInterval;
    const realClear = globalThis.clearInterval;
    jest
      .spyOn(globalThis, 'setInterval')
      .mockImplementation(((handler: () => void, ms?: number) => {
        const id = realSet(handler, ms);
        activeIntervals.add(id);
        return id;
      }) as typeof setInterval);
    jest
      .spyOn(globalThis, 'clearInterval')
      .mockImplementation(((id?: ReturnType<typeof setInterval>) => {
        activeIntervals.delete(id);
        realClear(id);
      }) as typeof clearInterval);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('4.7: pending block with Allow once and Deny, tool and arguments', () => {
    const fixture = setup({ sessionTitle: 'Refactor RPC registry' });
    expect(q(fixture, 'approval-badge')?.textContent?.trim()).toBe(
      'Waiting for you',
    );
    expect(q(fixture, 'approval-title')?.textContent?.trim()).toBe(
      'Horus wants to run a command',
    );
    expect(q(fixture, 'approval-tool')?.textContent?.trim()).toBe('Bash');
    expect(q(fixture, 'approval-args')?.textContent).toContain('"command": "ls -la"');
    expect(button(fixture, 'approval-allow')?.disabled).toBe(false);
    expect(button(fixture, 'approval-deny')?.disabled).toBe(false);
    expect(q(fixture, 'approval-hint')?.textContent?.trim()).toBe(
      'The session stays paused until someone answers.',
    );
  });

  it('D8: arguments are never truncated, and unsafe characters are stripped', () => {
    const long = 'echo ' + 'x'.repeat(5_000);
    const rlo = String.fromCodePoint(0x202e);
    const fixture = setup({
      request: request({ toolInput: { command: `${long} #${rlo}txt.exe` } }),
    });
    const text = q(fixture, 'approval-args')?.textContent ?? '';
    expect(text).toContain(long);
    expect(text).toContain('#txt.exe');
    expect(text).not.toContain(rlo);
    expect(q(fixture, 'approval-args')?.className).toContain('overflow-x-auto');
  });

  it('never binds arguments as HTML', () => {
    const fixture = setup({
      request: request({ toolInput: { command: '<img src=x onerror=alert(1)>' } }),
    });
    const args = q(fixture, 'approval-args');
    expect(args?.querySelector('img')).toBeNull();
    expect(args?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('emits the decision', () => {
    const fixture = setup();
    const decisions: string[] = [];
    fixture.componentInstance.answered.subscribe((d) => decisions.push(d));
    button(fixture, 'approval-allow')?.click();
    button(fixture, 'approval-deny')?.click();
    expect(decisions).toEqual(['allow', 'deny']);
  });

  it('decision 27: counts down to the worker deadline, then disables the buttons', () => {
    const fixture = setup({ request: request({ timeoutAt: NOW + 42_000 }) });
    expect(q(fixture, 'approval-deadline')?.textContent?.trim()).toBe(
      'Denied automatically in 42 s',
    );
    jest.advanceTimersByTime(2_000);
    fixture.detectChanges();
    expect(q(fixture, 'approval-deadline')?.textContent?.trim()).toBe(
      'Denied automatically in 40 s',
    );

    jest.advanceTimersByTime(40_000);
    fixture.detectChanges();
    expect(q(fixture, 'approval-timed-out')?.textContent?.trim()).toBe(
      'No answer within 60 s — the worker denied this request.',
    );
    expect(q(fixture, 'approval-deadline')).toBeNull();
    expect(button(fixture, 'approval-allow')?.disabled).toBe(true);
    expect(button(fixture, 'approval-deny')?.disabled).toBe(true);
    // The countdown stops at expiry.
    expect(activeIntervals.size).toBe(0);
  });

  it('one countdown timer, cleared on destroy', () => {
    const fixture = setup();
    expect(activeIntervals.size).toBe(1);
    fixture.destroy();
    expect(activeIntervals.size).toBe(0);
  });

  it('S2: many pending blocks share one timer, released by the last', () => {
    const first = setup({ request: request({ id: 'p0' }) });
    const others = [1, 2, 3, 4].map((n) => {
      const fixture = TestBed.createComponent(RemoteApprovalBlockComponent);
      fixture.componentRef.setInput(
        'request',
        request({ id: `p${n}`, timeoutAt: NOW + 10_000 * n }),
      );
      fixture.componentRef.setInput('machineName', 'Horus');
      fixture.detectChanges();
      return fixture;
    });
    expect(activeIntervals.size).toBe(1);

    jest.advanceTimersByTime(5_000);
    for (const fixture of [first, ...others]) fixture.detectChanges();
    expect(q(others[0], 'approval-deadline')?.textContent?.trim()).toBe(
      'Denied automatically in 5 s',
    );
    expect(q(others[3], 'approval-deadline')?.textContent?.trim()).toBe(
      'Denied automatically in 35 s',
    );
    expect(activeIntervals.size).toBe(1);

    for (const fixture of others) fixture.destroy();
    expect(activeIntervals.size).toBe(1);
    first.destroy();
    expect(activeIntervals.size).toBe(0);
  });

  it("shows the timeout copy once the worker's timeout record arrives", () => {
    const fixture = setup({ timedOut: true });
    expect(q(fixture, 'approval-timed-out')).not.toBeNull();
    expect(q(fixture, 'approval-badge')?.textContent?.trim()).toBe(
      'Denied by the worker',
    );
    expect(button(fixture, 'approval-allow')?.disabled).toBe(true);
    expect(activeIntervals.size).toBe(0);
  });

  it('a request without a deadline stays pending, with no timer', () => {
    const fixture = setup({ request: request({ timeoutAt: 0 }) });
    expect(q(fixture, 'approval-deadline')?.textContent?.trim()).toBe(
      'Stays pending, like a local request.',
    );
    expect(activeIntervals.size).toBe(0);
  });

  it('7c: a not-permitted answer shows neutral copy and disables the buttons', () => {
    const fixture = setup({
      error: {
        message: 'The machine or session was not found or access is denied.',
        code: 'MACHINE_NOT_FOUND_OR_FORBIDDEN',
      },
    });
    const error = q(fixture, 'approval-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain(
      'This request could not be answered from this app.',
    );
    expect(error?.textContent).toContain('grants');
    expect(button(fixture, 'approval-allow')?.disabled).toBe(true);
    expect(button(fixture, 'approval-deny')?.disabled).toBe(true);
  });

  it('an unavailable machine disables the buttons and says why', () => {
    const fixture = setup({ unavailableReason: 'Horus is not connected.' });
    expect(button(fixture, 'approval-allow')?.disabled).toBe(true);
    expect(q(fixture, 'approval-hint')?.textContent?.trim()).toBe(
      'Horus is not connected.',
    );
  });

  it('4.9 watch-only: no buttons at all, a focusable region with the reason', () => {
    const fixture = setup({ mode: 'watch-only' });
    expect(button(fixture, 'approval-allow')).toBeNull();
    expect(button(fixture, 'approval-deny')).toBeNull();
    expect(q(fixture, 'approval-badge')?.textContent?.trim()).toBe(
      'Waiting at Horus',
    );
    expect(q(fixture, 'approval-title')?.textContent?.trim()).toBe(
      'Horus is waiting for an answer',
    );
    expect(q(fixture, 'approval-readonly')?.textContent).toContain(
      'Answer this request at Horus. It cannot be answered from this app.',
    );
    expect(q(fixture, 'approval-block')?.getAttribute('tabindex')).toBe('0');
    expect(activeIntervals.size).toBe(0);
  });

  it('9c cached: read-only and not claimed pending', () => {
    const fixture = setup({ mode: 'cached' });
    expect(button(fixture, 'approval-allow')).toBeNull();
    expect(q(fixture, 'approval-badge')?.textContent?.trim()).toBe(
      'Saved request',
    );
    expect(q(fixture, 'approval-readonly')?.textContent).toContain(
      'may no longer be pending',
    );
  });
});
