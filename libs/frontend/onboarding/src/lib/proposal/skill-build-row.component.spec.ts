import { TestBed } from '@angular/core/testing';
import type {
  SkillBuildProposal,
  SkillJudgeItem,
} from '@ptah-extension/shared';
import { SkillBuildRowComponent } from './skill-build-row.component';

const proposal: SkillBuildProposal = {
  proposalId: 'proposal',
  name: 'project-conventions',
  description: 'Document the project conventions that are specific to this workspace.',
  itemIds: ['angular', 'rxjs'],
};

function judgedItem(
  itemId: string,
  name: string,
  outcomes: SkillJudgeItem['outcomes'],
): SkillJudgeItem {
  return {
    itemId,
    item: { kind: 'framework', name, evidence: `${name} evidence`, sourcePhase: 'project-profile' },
    registry: 'matched',
    candidateIds: [],
    candidateAssessments: [],
    outcomes,
    judgedBy: 'decision',
  };
}

const angular = judgedItem('angular', 'Angular', [
  { verdict: 'build', proposalId: 'proposal', reason: 'Describe local stores.', stage: 'decision' },
  { verdict: 'build', proposalId: 'other', reason: 'Other proposal.', stage: 'decision' },
]);
const rxjs = judgedItem('rxjs', 'RxJS', [
  { verdict: 'build', proposalId: 'proposal', reason: 'Describe error handling.', stage: 'normal' },
]);
const install = {
  verdict: 'install',
  candidateId: 'registry-skill',
  reason: 'Registry skill covers the framework.',
  stage: 'decision',
} as const;

function render(items: readonly SkillJudgeItem[] = [angular, rxjs]) {
  const fixture = TestBed.createComponent(SkillBuildRowComponent);
  fixture.componentRef.setInput('proposal', proposal);
  fixture.componentRef.setInput('items', items);
  fixture.componentRef.setInput('runId', 'run-1');
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  return {
    fixture,
    root,
    button: (label: string) =>
      Array.from(root.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === label,
      ),
  };
}

describe('SkillBuildRowComponent', () => {
  it('shows "No registry skill fits" iff no linked item has Install; shows dual-verdict intro otherwise', () => {
    const { fixture, root } = render([angular, rxjs, judgedItem('unlinked', 'Nx', [install])]);

    expect(root.textContent).toContain('No registry skill fits');
    expect(root.textContent).not.toContain('A project skill can add');

    fixture.componentRef.setInput('items', [angular, { ...rxjs, outcomes: [...rxjs.outcomes, install] }]);
    fixture.detectChanges();

    expect(root.textContent).not.toContain('No registry skill fits');
    expect(root.textContent).toContain('A project skill can add what the installed skill does not cover');
  });

  it('expands full reasons and covers in place and sends every linked Build reason to generation', () => {
    const { fixture, root, button } = render();
    const generateDraft = jest.fn();
    fixture.componentInstance.previewRequested.subscribe(({ params }) => generateDraft(params));

    expect(button('Create skill')).toBeUndefined();
    const more = button('More');
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    const detailsId = more?.getAttribute('aria-controls');
    const details = root.querySelector<HTMLElement>(`#${detailsId}`);
    expect(details?.hidden).toBe(true);

    more?.click();
    fixture.detectChanges();
    expect(button('Less')?.getAttribute('aria-expanded')).toBe('true');
    expect(details?.hidden).toBe(false);
    expect(details?.textContent).toContain(proposal.description);
    expect(details?.textContent).toContain('Angular');
    expect(details?.textContent).toContain('Describe local stores.');
    expect(details?.textContent).toContain('RxJS');
    expect(details?.textContent).toContain('Describe error handling.');
    expect(details?.textContent).not.toContain('Other proposal.');
    expect(generateDraft).not.toHaveBeenCalled();

    button('Preview draft')?.click();
    expect(generateDraft).toHaveBeenCalledWith({
      runId: 'run-1',
      proposalId: 'proposal',
      proposalName: proposal.name,
      items: [
        { itemId: 'angular', name: 'Angular', kind: 'framework', evidence: 'Angular evidence', buildReasons: ['Describe local stores.'] },
        { itemId: 'rxjs', name: 'RxJS', kind: 'framework', evidence: 'RxJS evidence', buildReasons: ['Describe error handling.'] },
      ],
    });
  });

  it('gives duplicate renderings distinct disclosure ids and exposes failed registry searches', () => {
    const items = [{ ...angular, registry: 'search-failed' as const }, rxjs];
    const first = render(items);
    const second = render(items);

    expect(first.button('More')?.getAttribute('aria-controls')).not.toBe(
      second.button('More')?.getAttribute('aria-controls'),
    );
    expect(first.root.textContent).toContain('Judged without registry candidates (search failed)');
  });

  it('keeps the opener focusable after creation and rejects a second Preview request', () => {
    const { fixture, root, button } = render();
    const open = jest.fn();
    fixture.componentInstance.previewRequested.subscribe(open);
    const opener = button('Preview draft');

    opener?.click();
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ opener }));

    fixture.componentRef.setInput('createdPath', '/skills/project-conventions/SKILL.md');
    fixture.detectChanges();

    expect(root.querySelector('[role="status"]')?.textContent).toContain('Created: /skills/project-conventions/SKILL.md');
    expect(opener?.getAttribute('aria-disabled')).toBe('true');
    expect(opener?.disabled).toBe(false);
    opener?.click();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
