import { TestBed } from '@angular/core/testing';
import type { SkillJudgeItem } from '@ptah-extension/shared';
import { SkillNotJudgedRowComponent } from './skill-not-judged-row.component';

const judgedItem: SkillJudgeItem = {
  itemId: 'lib:nx',
  item: {
    kind: 'library',
    name: 'Nx',
    evidence: 'nx.json in the repository root',
    sourcePhase: 'tooling',
  },
  registry: 'matched',
  candidateIds: [],
  candidateAssessments: [],
  outcomes: [],
  judgedBy: 'none',
};

function setup(overrides?: Partial<SkillJudgeItem>) {
  const fixture = TestBed.createComponent(SkillNotJudgedRowComponent);
  fixture.componentRef.setInput('item', { ...judgedItem, ...overrides });
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('SkillNotJudgedRowComponent', () => {
  it('shows the item with a Not judged status and no failed-search disclosure', () => {
    const { root } = setup();
    expect(root.textContent).toContain('Nx');
    expect(root.textContent).toContain('library');
    expect(root.textContent).toContain('Not judged');
    expect(root.textContent).not.toContain('Search failed');
  });

  it('discloses a failed registry search with its recorded reason (both-failed rows)', () => {
    const { root } = setup({
      registry: 'search-failed',
      registryFailure: { kind: 'timed-out', reason: 'Registry did not answer in 10 s' },
    });
    expect(root.textContent).toContain('Search failed');
    expect(root.textContent).toContain(
      'Registry search failed (timed-out): Registry did not answer in 10 s',
    );
  });

  it('falls back to a generic failed-search status without a recorded reason', () => {
    const { root } = setup({ registry: 'search-failed' });
    expect(root.textContent).toContain('Search failed');
    expect(root.textContent).toContain(
      'Registry search failed for this item.',
    );
  });

  it('emits the manual draft recovery action from a named, keyboard-reachable button', () => {
    const { fixture, root } = setup();
    const manualDraftRequested = jest.fn();
    fixture.componentInstance.manualDraftRequested.subscribe(
      manualDraftRequested,
    );
    const button = root.querySelector<HTMLButtonElement>('button');
    expect(button?.getAttribute('aria-label')).toBe(
      'Write a skill by hand for Nx',
    );
    button?.click();
    expect(manualDraftRequested).toHaveBeenCalledTimes(1);
  });
});
