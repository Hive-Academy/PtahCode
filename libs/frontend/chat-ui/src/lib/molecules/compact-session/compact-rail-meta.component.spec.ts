import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { CompactRailMetaComponent } from './compact-rail-meta.component';
import type { CompactLaneSummary } from './compact-lane.types';

const lanes: CompactLaneSummary = {
  rows: [],
  moreCount: 2,
  total: 2,
  counts: { running: 2, waiting: 0, error: 0, done: 0, stopped: 0 },
  kinds: { cli: 0, subagent: 2, background: 0 },
};

describe(CompactRailMetaComponent.name, () => {
  function render() {
    TestBed.configureTestingModule({ imports: [CompactRailMetaComponent] });
    const fixture = TestBed.createComponent(CompactRailMetaComponent);
    fixture.componentRef.setInput('title', 'Session');
    fixture.componentRef.setInput('lanes', {
      ...lanes,
      total: 0,
      moreCount: 0,
    });
    fixture.componentRef.setInput('todos', { kind: 'none' });
    fixture.componentRef.setInput('gitStats', { kind: 'none' });
    fixture.detectChanges();
    return fixture;
  }

  it('omits unavailable chips and diff', () => {
    const fixture = render();
    expect(
      fixture.nativeElement.querySelectorAll(
        '[data-ptah-badge], button, [data-testid="rail-linked-task"]',
      ),
    ).toHaveLength(0);
  });

  it('emits moreLanes from the dense count button', () => {
    const fixture = render();
    fixture.componentRef.setInput('density', 'dense');
    fixture.componentRef.setInput('lanes', lanes);
    fixture.detectChanges();
    const emitted = jest.fn();
    fixture.componentInstance.moreLanes.subscribe(emitted);
    const button = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement;
    expect(getComputedStyle(button).pointerEvents).toBe('auto');
    expect(button.getAttribute('aria-label')).toContain('2 lanes of Session');
    button.click();
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('emits moreLanes from the comfortable "+N more" button', () => {
    const fixture = render();
    fixture.componentRef.setInput('lanes', lanes);
    fixture.detectChanges();
    const emitted = jest.fn();
    fixture.componentInstance.moreLanes.subscribe(emitted);
    const button = fixture.nativeElement.querySelector(
      'button.rc-lane-overflow',
    ) as HTMLButtonElement;
    expect(getComputedStyle(button).pointerEvents).toBe('auto');
    expect(button.textContent?.trim()).toBe('+2 more');
    expect(button.getAttribute('aria-label')).toBe(
      'Open 2 more lanes of Session',
    );
    button.click();
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('makes the lane button tabbable only when innerTabbable is set', () => {
    const fixture = render();
    fixture.componentRef.setInput('density', 'dense');
    fixture.componentRef.setInput('lanes', lanes);
    fixture.detectChanges();
    const button = () =>
      fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button().tabIndex).toBe(-1);
    fixture.componentRef.setInput('innerTabbable', true);
    fixture.detectChanges();
    expect(button().tabIndex).toBe(0);
  });

  it('renders todo, diff, agent, CLI and ctx chips with titles', () => {
    const fixture = render();
    fixture.componentRef.setInput('todos', {
      kind: 'known',
      done: 1,
      total: 3,
      active: 'Write specs',
    });
    fixture.componentRef.setInput('gitStats', {
      kind: 'known',
      additions: 12,
      deletions: 4,
      partial: false,
    });
    fixture.componentRef.setInput('agentCount', 1);
    fixture.componentRef.setInput('lanes', {
      ...lanes,
      total: 0,
      moreCount: 0,
      kinds: { cli: 2, subagent: 0, background: 0 },
    });
    fixture.componentRef.setInput('contextPercent', 41.6);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const chips = Array.from(el.querySelectorAll<HTMLElement>('.rc-chip'));
    expect(chips.map((c) => c.textContent?.trim())).toEqual([
      '1/3',
      '1 agent',
      '2 CLI',
      '42% ctx',
    ]);
    expect(chips.map((c) => c.title)).toEqual([
      'Write specs',
      '1 agent',
      '2 CLI',
      '42% context used',
    ]);
    const diff = el.querySelector('.tabular-nums') as HTMLElement;
    expect(diff.textContent?.trim()).toBe('+12 −4');
    expect(diff.title).toBe('Uncommitted changes (+12 −4)');
    fixture.componentRef.setInput('agentCount', 3);
    fixture.detectChanges();
    expect(el.querySelectorAll('.rc-chip')[1].textContent?.trim()).toBe(
      '3 agents',
    );
  });

  it('uses short dense labels and keeps the full text in title and aria', () => {
    const fixture = render();
    fixture.componentRef.setInput('density', 'dense');
    fixture.componentRef.setInput('agentCount', 3);
    fixture.componentRef.setInput('contextPercent', 9);
    fixture.componentRef.setInput('gitStats', {
      kind: 'known',
      additions: 3829,
      deletions: 10,
      partial: false,
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const chips = Array.from(el.querySelectorAll<HTMLElement>('.rc-chip'));
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['3 ag', '9%']);
    expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual([
      '3 agents',
      '9% context used',
    ]);
    expect(chips.map((c) => c.title)).toEqual(['3 agents', '9% context used']);
    const diff = el.querySelector('.tabular-nums') as HTMLElement;
    expect(diff.textContent?.trim()).toBe('+3.8k −10');
    expect(diff.title).toBe('Uncommitted changes (+3829 −10)');
    fixture.componentRef.setInput('gitStats', {
      kind: 'known',
      additions: 999950,
      deletions: 1000,
      partial: false,
    });
    fixture.detectChanges();
    expect(diff.textContent?.trim()).toBe('+1m −1k');
  });

  it('keeps the diff stats from shrinking while chips can shrink', () => {
    const fixture = render();
    const css = readFileSync(
      join(__dirname, 'compact-rail-meta.component.ts'),
      'utf8',
    );
    expect(css).toMatch(
      /\.rc-chip\s*\{[^}]*flex-shrink:\s*1;[^}]*text-overflow:\s*ellipsis/,
    );
    // The task id gives up its width before any chip does.
    expect(css).toMatch(/\.rc-task\s*\{[^}]*flex-shrink:\s*1000;/);
    expect(
      (fixture.nativeElement.querySelector('.tabular-nums') as HTMLElement)
        .classList,
    ).toContain('shrink-0');
  });

  it('keeps the full linked task in title and accessible name', () => {
    const fixture = render();
    fixture.componentRef.setInput('linkedTask', {
      taskId: 'TASK_2026_LONG_IDENTIFIER',
      missing: true,
    });
    fixture.detectChanges();
    const task = fixture.nativeElement.querySelector(
      '[data-testid="rail-linked-task"]',
    ) as HTMLElement;
    expect(task.title).toContain('TASK_2026_LONG_IDENTIFIER');
    expect(task.getAttribute('aria-label')).toBe(task.title);
    expect(task.classList.contains('line-through')).toBe(true);
  });
});
