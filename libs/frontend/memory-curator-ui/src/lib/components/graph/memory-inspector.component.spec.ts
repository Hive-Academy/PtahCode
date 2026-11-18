import { TestBed } from '@angular/core/testing';
import type { MemoryGraphNodeWire } from '@ptah-extension/shared';
import { MemoryInspectorComponent } from './memory-inspector.component';

const node: MemoryGraphNodeWire = { id: 'a', subject: 'Subject', preview: '<b>text</b>', tier: 'core', kind: 'fact', salience: 0.8, hits: 2, pinned: false, sessionId: 'session', workspaceRoot: null, createdAt: 1, lastUsedAt: 2 };

describe('MemoryInspectorComponent', () => {
  it('shows one memory as text, loading, and emits actions', () => {
    const fixture = TestBed.createComponent(MemoryInspectorComponent);
    fixture.componentRef.setInput('nodes', [node]); fixture.componentRef.setInput('detailLoading', true); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Loading full memory');
    expect(root.textContent).toContain('session');
    expect(root.querySelector('b')).toBeNull();
    expect(root.textContent).not.toContain('Open source session');
    const ids: string[] = [];
    fixture.componentInstance.pin.subscribe(id => ids.push(id)); fixture.componentInstance.forget.subscribe(id => ids.push(id));
    (root.querySelector('[data-testid="memory-entry-pin"]') as HTMLButtonElement).click();
    (root.querySelector('[data-testid="memory-entry-forget"]') as HTMLButtonElement).click(); fixture.detectChanges();
    (root.querySelector('ptah-inline-confirm button') as HTMLButtonElement).click();
    expect(ids).toEqual(['a', 'a']);
  });
  it('shows multiple selected subjects', () => {
    const fixture = TestBed.createComponent(MemoryInspectorComponent);
    fixture.componentRef.setInput('nodes', [node, { ...node, id: 'b', subject: 'Second' }]); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2 memories selected');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Second');
  });
});
