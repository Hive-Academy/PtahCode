import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { isSameWorkingRoot } from '@ptah-extension/shared';

export const UNAVAILABLE_GIT_ROOT_MS = 60_000;

/** Renderer-wide, short-lived record of roots refused by the host. */
@Injectable({ providedIn: 'root' })
export class UnavailableGitRootsStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly entries = signal<readonly { path: string; until: number }[]>([]);
  readonly roots = this.entries.asReadonly();
  private expiry: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => { if (this.expiry !== null) clearTimeout(this.expiry); });
  }

  mark(path: string): void {
    const until = Date.now() + UNAVAILABLE_GIT_ROOT_MS;
    this.entries.update((entries) => [...entries.filter((entry) => !isSameWorkingRoot(entry.path, path)), { path, until }]);
    this.scheduleExpiry();
  }

  clear(path: string): void {
    this.entries.update((entries) => entries.filter((entry) => !isSameWorkingRoot(entry.path, path)));
    this.scheduleExpiry();
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
