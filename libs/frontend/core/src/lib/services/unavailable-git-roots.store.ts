import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { isSameWorkingRoot } from '@ptah-extension/shared';

export const UNAVAILABLE_GIT_ROOT_MS = 60_000;
export const MAX_UNAVAILABLE_GIT_ROOT_MS = 15 * 60_000;
const MAX_STRIKE_KEYS = 200;

/** The exclusion window for one root after its `strike`-th refusal. */
function windowForStrike(strike: number): number {
  return Math.min(
    UNAVAILABLE_GIT_ROOT_MS * 2 ** (strike - 1),
    MAX_UNAVAILABLE_GIT_ROOT_MS,
  );
}

/** Renderer-wide, short-lived record of roots refused by the host. */
@Injectable({ providedIn: 'root' })
export class UnavailableGitRootsStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly entries = signal<readonly { path: string; until: number }[]>([]);
  readonly roots = this.entries.asReadonly();
  /**
   * Refusals per root, keyed by the first spelling the store saw. Survives
   * expiry, so a root that keeps missing backs off instead of looping every
   * {@link UNAVAILABLE_GIT_ROOT_MS}; `clear` forgets them because a
   * successful read means the root is back.
   */
  private readonly strikes = new Map<string, number>();
  private expiry: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => { if (this.expiry !== null) clearTimeout(this.expiry); });
  }

  mark(path: string): void {
    const key = this.strikeKeyFor(path) ?? path;
    const strikes = this.strikes.get(key) ?? 0;
    const live = this.entries().some((entry) => entry.until > Date.now() && isSameWorkingRoot(entry.path, path));
    // A refusal while the root is already excluded refreshes the window only.
    const windowMs = live
      ? windowForStrike(Math.max(strikes, 1))
      : windowForStrike(strikes + 1);
    if (!live) {
      if (!this.strikes.has(key) && this.strikes.size >= MAX_STRIKE_KEYS) {
        const oldest = this.strikes.keys().next().value;
        if (oldest !== undefined) this.strikes.delete(oldest);
      }
      this.strikes.set(key, strikes + 1);
    }
    this.entries.update((entries) => [
      ...entries.filter((entry) => !isSameWorkingRoot(entry.path, path)),
      { path, until: Date.now() + windowMs },
    ]);
    this.scheduleExpiry();
  }

  clear(path: string): void {
    const key = this.strikeKeyFor(path);
    if (key !== null) this.strikes.delete(key);
    this.release(path);
  }

  release(path: string): void {
    this.entries.update((entries) => entries.filter((entry) => !isSameWorkingRoot(entry.path, path)));
    this.scheduleExpiry();
  }

  /** The stored strike key of this root, or null when the root has none. */
  private strikeKeyFor(path: string): string | null {
    for (const key of this.strikes.keys()) {
      if (isSameWorkingRoot(key, path)) return key;
    }
    return null;
  }

  private scheduleExpiry(): void {
    if (this.expiry !== null) clearTimeout(this.expiry);
    const entries = this.entries();
    if (entries.length === 0) { this.expiry = null; return; }
    const next = Math.min(...entries.map((entry) => entry.until));
    this.expiry = setTimeout(() => {
      this.entries.update((current) => current.filter((entry) => entry.until > Date.now()));
      this.scheduleExpiry();
    }, Math.max(0, next - Date.now()));
  }
}
