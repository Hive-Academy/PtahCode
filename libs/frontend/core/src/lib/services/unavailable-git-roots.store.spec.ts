import { TestBed } from '@angular/core/testing';
import { UNAVAILABLE_GIT_ROOT_MS, UnavailableGitRootsStore } from './unavailable-git-roots.store';

describe('UnavailableGitRootsStore', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    jest.useRealTimers();
  });

  it('shares a refused root, recovers on success, and expires stale exclusions', () => {
    jest.useFakeTimers();
    const roots = TestBed.inject(UnavailableGitRootsStore);
    roots.mark('/repo/child');
    expect(roots.roots().map((entry) => entry.path)).toEqual(['/repo/child']);
    roots.clear('/repo/child');
    expect(roots.roots()).toEqual([]);
    roots.mark('/repo/child');
    jest.advanceTimersByTime(UNAVAILABLE_GIT_ROOT_MS + 1);
    expect(roots.roots()).toEqual([]);
  });
});
