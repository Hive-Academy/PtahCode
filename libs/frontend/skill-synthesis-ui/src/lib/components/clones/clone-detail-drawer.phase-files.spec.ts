import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ROLE_PHASE_ALIASES,
  type CloneSummary,
  type SkillCloneHistoryEntry,
  type SkillClonePhaseFile,
} from '@ptah-extension/shared';

import {
  CloneDetailDrawerComponent,
  type CloneHistoryRequest,
  type ClonePhaseFileRequest,
} from './clone-detail-drawer.component';

function clone(overrides: Partial<CloneSummary> = {}): CloneSummary {
  return {
    slug: 'deep-research',
    kind: 'skill',
    cloneStatus: 'clone',
    diverged: false,
    invocationCount: 10,
    successRate: 0.8,
    lastEnhancedAt: null,
    historyCount: 1,
    pendingSourceHash: null,
    enhanceMinInvocations: 5,
    enhanceCooldownUntil: null,
    ...overrides,
  };
}

const PHASES: readonly SkillClonePhaseFile[] = ['phases/plan.md', 'phases/review.md'];
const HISTORY: readonly SkillCloneHistoryEntry[] = [
  { ts: '1717848000000', hasBody: true },
];

type Fixture = ComponentFixture<CloneDetailDrawerComponent>;

async function setup(
  entry: CloneSummary,
  phaseFiles: readonly SkillClonePhaseFile[] = PHASES,
  busy = false,
): Promise<Fixture> {
  await TestBed.configureTestingModule({
    imports: [CloneDetailDrawerComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(CloneDetailDrawerComponent);
  fixture.componentRef.setInput('clone', entry);
  fixture.componentRef.setInput('body', '# body');
  fixture.componentRef.setInput('history', HISTORY);
  fixture.componentRef.setInput('phaseFiles', phaseFiles);
  fixture.componentRef.setInput('busy', busy);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const all = (fixture: Fixture, testid: string): HTMLElement[] =>
  Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testid}"]`));

async function click(fixture: Fixture, el: HTMLElement): Promise<void> {
  el.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('CloneDetailDrawerComponent — phase files (U-D13 (1))', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lists one row per phase file of a skill', async () => {
    const fixture = await setup(clone());
    const rows = all(fixture, 'drawer-phase-file');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('phases/plan.md');
    expect(rows[1]?.textContent).toContain('phases/review.md');
  });

  it('shows no phase section for a skill without phase files', async () => {
    const fixture = await setup(clone(), []);
    expect(all(fixture, 'drawer-phase-files')).toHaveLength(0);
  });

  it('shows no phase section for an agent, retired role or not', async () => {
    const [retiredSlug] = Object.keys(ROLE_PHASE_ALIASES);
    const fixture = await setup(clone({ kind: 'agent', slug: retiredSlug ?? 'x' }));
    expect(all(fixture, 'drawer-phase-files')).toHaveLength(0);
  });

  it('emits phaseEnhance with the entry and the file', async () => {
    const fixture = await setup(clone());
    const emitted: ClonePhaseFileRequest[] = [];
    fixture.componentInstance.phaseEnhance.subscribe((e) => emitted.push(e));

    await click(fixture, all(fixture, 'drawer-phase-enhance-btn')[1] as HTMLElement);

    expect(emitted).toEqual([{ clone: clone(), file: 'phases/review.md' }]);
  });

  it('disables the phase enhance while another action runs', async () => {
    const fixture = await setup(clone(), PHASES, true);
    const buttons = all(fixture, 'drawer-phase-enhance-btn') as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('opens the history of one row and emits a one-file revert', async () => {
    const fixture = await setup(clone());
    const emitted: CloneHistoryRequest[] = [];
    fixture.componentInstance.phaseRevert.subscribe((e) => emitted.push(e));

    expect(all(fixture, 'drawer-phase-history')).toHaveLength(0);
    await click(fixture, all(fixture, 'drawer-phase-history-btn')[0] as HTMLElement);
    expect(all(fixture, 'drawer-phase-history')).toHaveLength(1);

    await click(fixture, all(fixture, 'drawer-phase-revert-btn')[0] as HTMLElement);
    expect(emitted).toEqual([
      { clone: clone(), ts: '1717848000000', file: 'phases/plan.md' },
    ]);
  });
});
