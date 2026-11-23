import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import { UnavailableGitRootsStore, VSCodeService } from '@ptah-extension/core';
import { ChangeSetActionsService } from '../../../services/change-set/change-set-actions.service';
import { SessionWorktreeLookup } from '../../../services/session-git-scope/session-worktree-lookup.service';
import {
  SessionGitStatsStore,
  type SessionGitState,
} from '../../../services/session-git-stats/session-git-stats.store';
import { InspectorGitSectionComponent } from './inspector-git-section.component';

const knownGit = {
  kind: 'known',
  branch: 'feat/inspector',
  additions: 128,
  deletions: 42,
  partial: false,
} satisfies SessionGitState;

function render(git: SessionGitState, originBranch?: string) {
  const state = signal(git);
  const untrack = jest.fn();
  const track = jest.fn(() => untrack);
  const openScm = jest.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [InspectorGitSectionComponent],
    providers: [
      {
        provide: TabManagerService,
        useValue: {
          findTabByIdAcrossWorkspaces: () => ({
            tab: { claudeSessionId: 'session-1', agentOrigin: { branch: originBranch } },
            workspacePath: '/workspace',
          }),
        },
      },
      { provide: UnavailableGitRootsStore, useValue: { roots: () => [] } },
      { provide: VSCodeService, useValue: { config: () => ({}) } },
      { provide: SessionGitStatsStore, useValue: { stateFor: state, track } },
      { provide: SessionWorktreeLookup, useValue: { worktreeFor: () => ({ worktreePath: null }) } },
      { provide: ChangeSetActionsService, useValue: { openScm } },
    ],
  });

  const fixture = TestBed.createComponent(InspectorGitSectionComponent);
  fixture.componentRef.setInput('tabId', 'tab-1');
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, state, track, untrack, openScm };
}

describe(InspectorGitSectionComponent.name, () => {
  it('shows the branch and signed counts in the shared section and opens Review changes', () => {
    const { root, openScm } = render(knownGit);
    const section = root.querySelector('ptah-surface-section[role="region"]');
    const heading = section?.querySelector('h3');
    expect(heading?.textContent?.trim()).toBe('GIT');
    expect(section?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(root.querySelector('ptah-description-list [title="feat/inspector"]')?.textContent).toBe('feat/inspector');
    expect(root.querySelector('[data-ptah-badge]')).toBeNull();
    const counts = root.querySelector('[title="Uncommitted changes"]');
    expect(counts?.querySelector('.diff-add-text')?.textContent).toBe('+128');
    expect(counts?.querySelector('.diff-del-text')?.textContent).toBe('−42');
    const review = root.querySelector<HTMLButtonElement>('button[data-ptah-button]');
    expect(review?.textContent?.trim()).toBe('Review changes');
    expect(review?.tabIndex).toBe(0);
    review?.click();
    expect(openScm).toHaveBeenCalledTimes(1);
  });

  it('labels partial counts and distinguishes zero from unavailable', () => {
    const { root } = render({ ...knownGit, additions: 0, partial: true });
    const counts = root.querySelector('[title="Some files could not be counted"]');
    expect(counts?.querySelector('.diff-add-text')?.textContent).toBe('+0+');
    expect(counts?.querySelector('.diff-del-text')?.textContent).toBe('−42+');
  });

  it('shows a detached badge beside HEAD when reported by Git', () => {
    const { root } = render({ ...knownGit, branch: 'HEAD' });
    const branch = root.querySelector('[title="HEAD"]');
    expect(branch?.textContent).toBe('HEAD');
    expect(branch?.nextElementSibling?.querySelector('[data-ptah-badge]')?.textContent).toBe('detached');
  });

  it('keeps the session origin branch and still shows detached HEAD for the working root', () => {
    const { root } = render({ ...knownGit, branch: 'HEAD' }, 'feat/origin');
    expect(root.querySelector('[title="feat/origin"]')?.textContent).toBe('feat/origin');
    const badge = root.querySelector('[data-ptah-badge]');
    expect(badge?.textContent).toBe('detached');
    expect(badge?.previousElementSibling?.textContent).toBe('HEAD');
  });

  it('shows a muted dash for an unknown branch without inferring detached HEAD', () => {
    const { root } = render({ ...knownGit, branch: null });
    expect(root.querySelector('.font-mono.text-base-content-muted')?.textContent).toBe('—');
    expect(root.querySelector('.sr-only')?.textContent).toBe('Unknown branch');
    expect(root.querySelector('[data-ptah-badge]')).toBeNull();
  });

  it('shows an unavailable repository status without a Review changes button', () => {
    const { fixture, root, state } = render({ kind: 'none' });
    expect(root.textContent).toContain('Not a git repository');
    expect(root.querySelector('button')).toBeNull();
    state.set({ kind: 'unknown', reason: 'unavailable' });
    fixture.detectChanges();
    expect(root.textContent).toContain('Git changes unavailable');
    expect(root.textContent).toContain('—');
    expect(root.querySelector('button')).toBeNull();
  });

  it('retries a failed read once while busy and releases tracking on destroy', () => {
    const { fixture, root, state, track, untrack } = render({ kind: 'unknown', reason: 'failed' });
    expect(track).toHaveBeenCalledWith('/workspace', 'tab-1');
    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Could not read git status');
    const retry = alert?.querySelector('button');
    expect(retry?.getAttribute('aria-label')).toBe('Retry reading git status');
    expect(retry?.tabIndex).toBe(0);
    retry?.click();
    fixture.detectChanges();
    expect(retry?.getAttribute('aria-busy')).toBe('true');
    expect(track).toHaveBeenCalledTimes(2);
    expect(untrack).toHaveBeenCalledTimes(1);
    retry?.click();
    fixture.detectChanges();
    expect(track).toHaveBeenCalledTimes(2);
    state.set(knownGit);
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    fixture.destroy();
    expect(untrack).toHaveBeenCalledTimes(2);
  });
});
