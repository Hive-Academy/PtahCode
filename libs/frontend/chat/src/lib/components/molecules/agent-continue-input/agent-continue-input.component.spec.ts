import { Component, input, output } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { MonitoredAgent } from '@ptah-extension/chat-streaming';
import { LaneComposerComponent } from '../lane-composer/lane-composer.component';
import { AgentContinueInputComponent, laneStateChip } from './agent-continue-input.component';
import type { LaneStateChip } from '../lane-composer/lane-composer-labels';

const agentId = '11111111-1111-4111-8111-111111111111';

/** Stands in for the lane composer; its behaviour is pinned by lane-composer.component.spec.ts. */
@Component({ selector: 'ptah-lane-composer', standalone: true, template: '<textarea></textarea>' })
class LaneComposerStubComponent {
  readonly agentId = input.required<string>();
  readonly laneLabel = input('lane');
  readonly cli = input('CLI');
  readonly stopped = input(false);
  readonly showLaneControls = input(false);
  readonly resumable = input(false);
  readonly stopPending = input(false);
  readonly resumePending = input(false);
  readonly laneState = input<LaneStateChip | null>(null);
  readonly stopRequested = output<Event>();
  readonly resumeRequested = output<Event>();
}

function makeAgent(overrides: Partial<MonitoredAgent> = {}): MonitoredAgent {
  return {
    agentId, cli: 'codex', task: 'Do work', status: 'running', startedAt: 1,
    stdout: '', stderr: '', expanded: true, segments: [], streamEvents: [],
    streamRevision: 0, permissionQueue: [], supportsContinuation: true,
    ...overrides,
  } as MonitoredAgent;
}

function capabilities(steer: 'supported' | 'unsupported'): NonNullable<MonitoredAgent['effectiveCapabilities']> {
  return {
    agentId: agentId as NonNullable<MonitoredAgent['effectiveCapabilities']>['agentId'],
    resolvedAt: 1, source: 'live-handle',
    messaging: {
      steer: { state: steer }, interrupt: { state: 'unsupported' },
      continuation: { state: 'unsupported' }, resume: { state: 'unsupported' },
    },
    mcp: { state: 'unsupported' },
  };
}

describe('AgentContinueInputComponent', () => {
  let fixture: ComponentFixture<AgentContinueInputComponent>;

  function setup(agent = makeAgent(), variant: 'panel' | 'composer' = 'composer'): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [AgentContinueInputComponent], errorOnUnknownProperties: true });
    TestBed.overrideComponent(AgentContinueInputComponent, {
      remove: { imports: [LaneComposerComponent] },
      add: { imports: [LaneComposerStubComponent] },
    });
    fixture = TestBed.createComponent(AgentContinueInputComponent);
    fixture.componentRef.setInput('agent', agent);
    fixture.componentRef.setInput('variant', variant);
    fixture.detectChanges();
  }

  function composer(): LaneComposerStubComponent | null {
    const debug = fixture.debugElement.query((element) => element.componentInstance instanceof LaneComposerStubComponent);
    return (debug?.componentInstance as LaneComposerStubComponent | undefined) ?? null;
  }

  it('mounts one lane composer for the canvas and the panel, with no variant', () => {
    setup();
    expect(composer()?.showLaneControls()).toBe(true);
    expect(composer()?.laneLabel()).toBe('codex');
    expect(composer()?.stopped()).toBe(false);
    setup(makeAgent({ displayName: 'Codex' }), 'panel');
    expect(composer()?.showLaneControls()).toBe(false);
    // The stub has no `variant` input, so a `[variant]` binding would fail to compile here.
    expect(composer()?.laneLabel()).toBe('Codex');
  });

  it('shows Stop without a text input while running and Resume when stopped', () => {
    const running = makeAgent({ status: 'running', supportsContinuation: false });
    setup(running);
    expect(composer()).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Stop generating"]')).not.toBeNull();
    fixture.componentRef.setInput('agent', { ...running, status: 'stopped', cliSessionId: 'cli-1' });
    fixture.detectChanges();
    expect(composer()?.stopped()).toBe(true);
    expect(composer()?.resumable()).toBe(true);
    expect(composer()?.laneState()?.label).toBe('Stopped');
  });

  it('names the Ptah budget monitor when a budget stop ended the lane', () => {
    setup(makeAgent({ status: 'stopped', cliSessionId: 'cli-1', stopReason: 'budget' }));
    expect(composer()?.laneState()).toEqual({ label: 'Budget stop', detail: 'Stopped by Ptah budget monitor', tone: 'need' });
    setup(makeAgent({ status: 'stopped', cliSessionId: 'cli-1' }));
    expect(composer()?.laneState()?.detail).not.toContain('budget monitor');
  });

  it('renders no line under the composer: the lane state goes into the composer chip', () => {
    setup(makeAgent({ status: 'stopped', cliSessionId: '06d21aa3-x', stopReason: 'host-restart' }));
    expect(composer()?.laneState()).toEqual({ label: 'Interrupted', detail: 'Stopped · Interrupted by host restart', tone: 'idle' });
    const host = fixture.nativeElement as HTMLElement;
    // Only the composer is in the block: no status line beside or under it.
    expect(host.querySelector('[data-testid="lane-terminal-status"]')).toBeNull();
    expect(host.querySelector('[data-testid="lane-state-chip"]')).toBeNull();
    expect(host.textContent?.trim()).toBe('');
  });

  it('puts the state chip beside Stop or Resume when there is no composer card', () => {
    setup(makeAgent({ status: 'stopped', supportsContinuation: false, cliSessionId: undefined, stopReason: 'repeat-call' }));
    const chip = fixture.nativeElement.querySelector('[data-testid="lane-state-chip"]') as HTMLElement;
    expect(chip.textContent).toContain('Stopped');
    expect(chip.textContent).toContain('repeated the same tool call');
    expect(chip.getAttribute('role')).toBe('status');
  });

  it('offers Stop but no message composer while the lane is starting', () => {
    setup(makeAgent({ status: 'starting', effectiveCapabilities: capabilities('supported') }));
    expect(composer()).toBeNull();
    const requested = jest.fn();
    fixture.componentInstance.stopRequested.subscribe(requested);
    (fixture.nativeElement.querySelector('[aria-label="Stop generating"]') as HTMLButtonElement).click();
    expect(requested).toHaveBeenCalledTimes(1);
  });

  it('mounts the composer for a running steer-capable lane and relays its Stop and Resume', () => {
    setup(makeAgent({ supportsContinuation: false, effectiveCapabilities: capabilities('supported') }));
    const stop = jest.fn();
    const resume = jest.fn();
    fixture.componentInstance.stopRequested.subscribe(stop);
    fixture.componentInstance.resumeRequested.subscribe(resume);
    composer()?.stopRequested.emit(new Event('click'));
    composer()?.resumeRequested.emit(new Event('click'));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('stopPending', true);
    fixture.detectChanges();
    expect(composer()?.stopPending()).toBe(true);
  });

  it('mounts the composer for a running ACP lane from its declared capabilities before any turn ends (F3)', () => {
    const declared = capabilities('unsupported');
    const potential = { ...declared, messaging: { ...declared.messaging, continuation: { state: 'supported' as const } } };
    setup(makeAgent({ cli: 'grok', supportsContinuation: undefined, cliSessionId: undefined, effectiveCapabilities: undefined,
      potentialCapabilities: potential as unknown as MonitoredAgent['potentialCapabilities'] }));
    expect(composer()).not.toBeNull();
    expect(composer()?.stopped()).toBe(false);
  });

  it('shows Stop alone for a running lane without steering or continuation', () => {
    setup(makeAgent({ supportsContinuation: false, effectiveCapabilities: capabilities('unsupported') }));
    expect(composer()).toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="Stop generating"]')).not.toBeNull();
  });

  it('renders no message field when continuation is unavailable', () => {
    setup(makeAgent({ supportsContinuation: false, status: 'completed' }));
    expect(composer()).toBeNull();
    setup(makeAgent({ supportsContinuation: undefined, status: 'completed' }));
    expect(composer()).toBeNull();
  });

  it('reads "Stopping…" until the process exits, then stopped by you (D9)', () => {
    const stopping = makeAgent({ status: 'stopped', cliSessionId: 'cli-1', stopRequestedAt: 5, stopAcknowledged: true, stoppedByUser: true });
    setup(stopping);
    expect(composer()?.laneState()?.label).toBe('Stopping…');
    expect(composer()?.stopPending()).toBe(true);
    fixture.componentRef.setInput('agent', { ...stopping, stopRequestedAt: undefined, stopAcknowledged: undefined });
    fixture.detectChanges();
    expect(composer()?.laneState()).toMatchObject({ label: 'Stopped', detail: 'Stopped by you' });
    expect(composer()?.stopPending()).toBe(false);
  });

  it('announces why a Stop failed, in the chip beside Stop', () => {
    setup(makeAgent({ status: 'running', supportsContinuation: false, stopError: 'Agent not found: lane' }));
    const alert = fixture.nativeElement.querySelector('[data-testid="lane-state-chip"]') as HTMLElement;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('Stop failed');
    expect(alert.textContent).toContain('Agent not found: lane');
  });

  it('shows Stopping… on a running lane the moment Stop is pressed', () => {
    setup(makeAgent({ status: 'running', stopRequestedAt: 5, stoppedByUser: true }));
    expect(composer()?.laneState()?.label).toBe('Stopping…');
  });

  it('renders a user stop that an older host reports as failed as stopped, not failed (D13)', () => {
    expect(laneStateChip(makeAgent({ status: 'failed', stoppedByUser: true }))).toEqual(
      { label: 'Stopped', detail: 'Stopped by you', tone: 'idle' });
    expect(laneStateChip(makeAgent({ status: 'failed' }))).toEqual({ label: 'Failed', detail: 'Failed', tone: 'err' });
    expect(laneStateChip(makeAgent({ status: 'running' }))).toBeNull();
    expect(laneStateChip(makeAgent({ status: 'completed' }))).toBeNull();
  });
});
