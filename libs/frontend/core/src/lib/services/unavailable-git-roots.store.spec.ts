import { TestBed } from '@angular/core/testing';
import {
  MAX_UNAVAILABLE_GIT_ROOT_MS,
  UNAVAILABLE_GIT_ROOT_MS,
  UnavailableGitRootsStore,
} from './unavailable-git-roots.store';

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

  it('escalates the window after each expiry and caps it at 15 minutes', () => {
    jest.useFakeTimers();
    const roots = TestBed.inject(UnavailableGitRootsStore);
    const root = '/repo/child';
    const markAndExpire = (expectedWindow: number): void => {
      roots.mark(root);
      expect(roots.roots()[0]?.until).toBe(Date.now() + expectedWindow);
      jest.advanceTimersByTime(expectedWindow + 1);
      expect(roots.roots()).toEqual([]);
    };

    markAndExpire(UNAVAILABLE_GIT_ROOT_MS);
    markAndExpire(2 * UNAVAILABLE_GIT_ROOT_MS);
    markAndExpire(4 * UNAVAILABLE_GIT_ROOT_MS);
    markAndExpire(8 * UNAVAILABLE_GIT_ROOT_MS);
    // The fifth refusal would ask for 16 minutes; the cap keeps it at 15.
    markAndExpire(MAX_UNAVAILABLE_GIT_ROOT_MS);
    markAndExpire(MAX_UNAVAILABLE_GIT_ROOT_MS);
  });

  it('adds no strike while the root is still excluded', () => {
    jest.useFakeTimers();
    const roots = TestBed.inject(UnavailableGitRootsStore);
    const root = '/repo/child';

    roots.mark(root);
    jest.advanceTimersByTime(10_000);
    roots.mark(root);
    // The re-mark refreshes the current window instead of doubling it.
    expect(roots.roots()[0]?.until).toBe(Date.now() + UNAVAILABLE_GIT_ROOT_MS);
    jest.advanceTimersByTime(UNAVAILABLE_GIT_ROOT_MS + 1);
    expect(roots.roots()).toEqual([]);

    roots.mark(root);
    expect(roots.roots()[0]?.until).toBe(Date.now() + 2 * UNAVAILABLE_GIT_ROOT_MS);
  });

  it('forgets the strikes on clear, so the next window starts at 60 s', () => {
    jest.useFakeTimers();
    const roots = TestBed.inject(UnavailableGitRootsStore);
    const root = '/repo/child';

    roots.mark(root);
    jest.advanceTimersByTime(UNAVAILABLE_GIT_ROOT_MS + 1);
    roots.mark(root);
    expect(roots.roots()[0]?.until).toBe(Date.now() + 2 * UNAVAILABLE_GIT_ROOT_MS);

    roots.clear(root);
    roots.mark(root);
    expect(roots.roots()[0]?.until).toBe(Date.now() + UNAVAILABLE_GIT_ROOT_MS);
  });

  it('keeps strikes when releasing a root for an organization retry', () => {
    jest.useFakeTimers();
    const roots = TestBed.inject(UnavailableGitRootsStore);
    roots.mark('/repo/child');
    roots.release('/repo/child');
    expect(roots.roots()).toEqual([]);
    roots.mark('/repo/child');
    expect(roots.roots()[0]?.until).toBe(Date.now() + 2 * UNAVAILABLE_GIT_ROOT_MS);
  });

  it('adds a strike if the window passed before its timer callback', () => {
    jest.useFakeTimers();
    const roots = TestBed.inject(UnavailableGitRootsStore);
    roots.mark('/repo/child');
    jest.setSystemTime(Date.now() + UNAVAILABLE_GIT_ROOT_MS + 1);
    roots.mark('/repo/child');
    expect(roots.roots()[0]?.until).toBe(Date.now() + 2 * UNAVAILABLE_GIT_ROOT_MS);
  });

  it('evicts the oldest strike when a 201st root is refused', () => {
    jest.useFakeTimers();
    const roots = TestBed.inject(UnavailableGitRootsStore);
    for (let index = 0; index < 201; index++) {
      roots.mark(`/repo/${index}`);
      roots.release(`/repo/${index}`);
    }
    roots.mark('/repo/0');
    expect(roots.roots()[0]?.until).toBe(Date.now() + UNAVAILABLE_GIT_ROOT_MS);
    roots.release('/repo/0');
    roots.mark('/repo/200');
    expect(roots.roots()[0]?.until).toBe(Date.now() + 2 * UNAVAILABLE_GIT_ROOT_MS);
  });
});
