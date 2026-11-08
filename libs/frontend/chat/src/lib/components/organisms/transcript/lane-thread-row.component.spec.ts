import { TestBed } from '@angular/core/testing';
import { AgentDeliveryStore } from '@ptah-extension/chat-streaming';
import { LaneThreadRowComponent } from './lane-thread-row.component';
import type { LaneThreadEntry } from './lane-thread';

function render(entry: LaneThreadEntry): HTMLElement {
  const fixture = TestBed.createComponent(LaneThreadRowComponent);
  fixture.componentRef.setInput('entry', entry);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector('[role="listitem"]')!;
}

describe('LaneThreadRowComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [LaneThreadRowComponent],
    providers: [{ provide: AgentDeliveryStore, useValue: {
      parentStatus: () => ({ label: 'Waiting for parent', attention: false, actions: [] }),
    } }],
  }));

  it('renders a lane-sender entry with its name, its own border and an accessible label', () => {
    const item = render({ id: 'receipt:peer-1', sender: 'From lane Schema', senderKind: 'peer-lane', senderAgentId: 'agent-2',
      kind: 'message', timestamp: 1_700_000_000_000, body: 'Schema is ready' });
    expect(item.textContent).toContain('From lane Schema');
    expect(item.getAttribute('aria-label')).toMatch(/^From lane Schema, .+, message$/);
    expect(item.getAttribute('data-sender-kind')).toBe('peer-lane');
    expect(item.classList.contains('border-secondary')).toBe(true);
    expect(item.classList.contains('border-info')).toBe(false);
    expect(item.classList.contains('border-primary')).toBe(false);
    expect(item.classList.contains('border-success')).toBe(false);
    expect(item.querySelector('span.font-semibold')?.getAttribute('title')).toBe('agent-2');
  });

  it('styles by entry kind, not by the label text', () => {
    // A parent label that happens to read "You" must still style as the parent.
    const item = render({ id: 'm', sender: 'You', senderKind: 'parent', kind: 'message', timestamp: 1, body: 'x' });
    expect(item.classList.contains('border-info')).toBe(true);
    expect(item.classList.contains('border-primary')).toBe(false);
  });

  it('marks a failed completion of this lane as an error only', () => {
    const item = render({ id: 'completion', sender: 'Docs · Codex', senderKind: 'this-lane', kind: 'completion',
      timestamp: 1, body: '', verdict: 'Failed' });
    expect(item.classList.contains('border-error')).toBe(true);
    expect(item.classList.contains('border-success')).toBe(false);
  });

  it('keeps reports collapsed until the header button is clicked', () => {
    const fixture = TestBed.createComponent(LaneThreadRowComponent);
    fixture.componentRef.setInput('entry', { id: 'report-1', sender: 'codex', senderKind: 'this-lane',
      kind: 'report', timestamp: 1, body: 'Short summary\nFull report with /very/long/path' } satisfies LaneThreadEntry);
    fixture.detectChanges();
    const item = fixture.nativeElement as HTMLElement;
    const button = item.querySelector('button')!;
    const body = item.querySelector<HTMLElement>('[id^="lane-thread-detail-"]')!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe(body.id);
    expect(button.textContent).toContain('Short summary');
    expect(body.hidden).toBe(true);
    button.click(); fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(body.hidden).toBe(false);
    expect(body.textContent).toContain('Full report with /very/long/path');
    button.click(); fixture.detectChanges();
    expect(body.hidden).toBe(true);
  });

  it('keeps messages fully visible without an expansion button', () => {
    const item = render({ id: 'message-1', sender: 'You', senderKind: 'user', kind: 'message', timestamp: 1,
      body: 'First line\nSecond line' });
    expect(item.querySelector('button')).toBeNull();
    expect(item.textContent).toContain('Second line');
  });

  it('keeps rejected acknowledgments in the error tone and expands their text', () => {
    const fixture = TestBed.createComponent(LaneThreadRowComponent);
    fixture.componentRef.setInput('entry', { id: 'ack-1', sender: 'codex', senderKind: 'this-lane',
      kind: 'ack', timestamp: 1, body: 'Rejected by parent', ackState: 'rejected' } satisfies LaneThreadEntry);
    fixture.detectChanges();
    const item = fixture.nativeElement as HTMLElement;
    expect(item.querySelector('[role="listitem"]')?.classList.contains('border-error')).toBe(true);
    expect(item.querySelector('.badge-error')?.textContent).toContain('Rejected');
    item.querySelector('button')!.click(); fixture.detectChanges();
    expect(item.querySelector('[id^="lane-thread-detail"]')?.textContent).toContain('Rejected by parent');
  });

  it('shows completion verdict and delivery status after expansion', () => {
    const fixture = TestBed.createComponent(LaneThreadRowComponent);
    fixture.componentRef.setInput('entry', { id: 'completion-1', sender: 'codex', senderKind: 'this-lane',
      kind: 'completion', timestamp: 1, body: '', verdict: 'Deliverables written',
      parentDelivery: { agentId: 'lane', kind: 'completion', state: 'delivered' } } satisfies LaneThreadEntry);
    fixture.detectChanges();
    const item = fixture.nativeElement as HTMLElement;
    expect(item.querySelector('ptah-delivery-status')).toBeNull();
    expect(item.querySelector('.badge')?.classList).toContain('badge-success');
    item.querySelector('button')!.click(); fixture.detectChanges();
    expect(item.querySelector('[id^="lane-thread-detail"]')?.textContent).toContain('Deliverables written');
    expect(item.querySelectorAll('ptah-delivery-status')).toHaveLength(1);
  });

  it('keeps a pending parent delivery on the collapsed card and shows it once when expanded', () => {
    const fixture = TestBed.createComponent(LaneThreadRowComponent);
    fixture.componentRef.setInput('entry', { id: 'report-1', sender: 'codex', senderKind: 'this-lane',
      kind: 'report', timestamp: 1, body: 'Done',
      parentDelivery: { agentId: 'lane', kind: 'report', state: 'pending' } } satisfies LaneThreadEntry);
    fixture.detectChanges();
    const item = fixture.nativeElement as HTMLElement;
    expect(item.querySelectorAll('ptah-delivery-status')).toHaveLength(1);
    item.querySelector('button')!.click(); fixture.detectChanges();
    expect(item.querySelectorAll('ptah-delivery-status')).toHaveLength(1);
  });

  it('gives two lanes with the same entry id their own detail ids', () => {
    const entry = { id: 'completion', sender: 'codex', senderKind: 'this-lane', kind: 'completion',
      timestamp: 1, body: '', verdict: 'Deliverables written' } satisfies LaneThreadEntry;
    const rows = [0, 1].map(() => {
      const fixture = TestBed.createComponent(LaneThreadRowComponent);
      fixture.componentRef.setInput('entry', entry);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    });
    const ids = rows.map(row => row.querySelector('[id^="lane-thread-detail"]')!.id);
    expect(new Set(ids).size).toBe(2);
    rows.forEach((row, index) => expect(row.querySelector('button')!.getAttribute('aria-controls')).toBe(ids[index]));
  });
});
