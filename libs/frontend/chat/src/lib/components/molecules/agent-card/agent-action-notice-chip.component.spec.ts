import { TestBed } from '@angular/core/testing';
import type { SubagentRecord } from '@ptah-extension/chat-streaming';
import {
  AgentActionNoticeChipComponent,
  subagentActionNoticeView,
  type LaneActionNoticeView,
} from './agent-action-notice-chip.component';

const ask = {
  actor: 'ptah-budget',
  action: 'asked-handoff',
  reason: 'weighted-budget',
  nextStep: 'return-report',
} as const;
const pause = { ...ask, action: 'paused', nextStep: 'review-live-agent' } as const;

const record = (overrides: Partial<SubagentRecord> = {}): SubagentRecord =>
  ({
    parentToolUseId: 'task-1',
    agentId: 'agent-7',
    status: 'running',
    ...overrides,
  }) as SubagentRecord;

describe('AgentActionNoticeChipComponent (TASK_2026_2310)', () => {
  const render = (view: LaneActionNoticeView, testId?: string): HTMLElement => {
    const fixture = TestBed.createComponent(AgentActionNoticeChipComponent);
    fixture.componentRef.setInput('view', view);
    if (testId) fixture.componentRef.setInput('testId', testId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the label, the full text as title, and a sr-only "Notice:" prefix', () => {
    const el = render({ label: 'Handoff requested', text: 'Full sentence.', paused: false });
    expect(el.getAttribute('data-testid')).toBe('lane-action-notice');
    expect(el.getAttribute('title')).toBe('Full sentence.');
    expect(el.classList).toContain('text-info');
    const srOnly = Array.from(el.querySelectorAll('.sr-only')).map((s) => s.textContent);
    expect(srOnly[0]).toBe('Notice: ');
    expect(srOnly[1]).toContain('Full sentence.');
    expect(el.textContent).toContain('Handoff requested');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.getAttribute('aria-live')).toBeNull();
  });

  it('marks a pause as a warning and takes a custom test id', () => {
    const el = render(
      { label: 'Paused · still running', text: 'Paused.', paused: true },
      'subagent-action-notice',
    );
    expect(el.getAttribute('data-testid')).toBe('subagent-action-notice');
    expect(el.classList).toContain('text-warning');
    expect(el.classList).not.toContain('text-info');
  });
});

describe('subagentActionNoticeView (TASK_2026_2310)', () => {
  it('builds a handoff view from host text on a live subagent', () => {
    expect(
      subagentActionNoticeView(record({ actionNotice: ask, actionNoticeText: 'Host text.' })),
    ).toEqual({ label: 'Handoff requested', text: 'Host text.', paused: false });
  });

  it('falls back to reader copy naming the teammate, else the agent id', () => {
    const named = subagentActionNoticeView(record({ actionNotice: ask, teammateName: 'scout' }));
    expect(named?.text).toContain('asked scout for a handoff');
    expect(named?.text).toContain('The execution remains live');
    const byId = subagentActionNoticeView(record({ actionNotice: pause }));
    expect(byId?.label).toBe('Paused · still running');
    expect(byId?.paused).toBe(true);
    expect(byId?.text).toContain('agent-7');
  });

  it('counts pending and background subagents as live', () => {
    expect(subagentActionNoticeView(record({ status: 'pending', actionNotice: ask }))).not.toBeNull();
    expect(subagentActionNoticeView(record({ status: 'background', actionNotice: ask }))).not.toBeNull();
  });

  it('shows nothing without a notice, for a terminal subagent, or for an ended notice', () => {
    expect(subagentActionNoticeView(record())).toBeNull();
    expect(subagentActionNoticeView(record({ status: 'completed', actionNotice: ask }))).toBeNull();
    expect(subagentActionNoticeView(record({ status: 'failed', actionNotice: pause }))).toBeNull();
    expect(
      subagentActionNoticeView(record({ actionNotice: { ...ask, action: 'ended' } })),
    ).toBeNull();
  });
});
