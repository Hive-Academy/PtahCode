import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, DestroyRef, Type, inject, signal,
} from '@angular/core';
import { ClaudeRpcService } from '@ptah-extension/core';
import { GitDockScopeStore, loadReviewShell } from '@ptah-extension/git-ui/services';
import { GitWindowScopeSchema } from '@ptah-extension/shared';
import { GitWindowScopeHandler } from './git-window.config';

@Component({
  selector: 'ptah-git-window',
  standalone: true,
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex items-center justify-between border-b border-base-300 px-4 py-2">
      <h1 class="text-sm font-semibold">Git</h1>
      <button type="button" class="btn btn-ghost btn-sm" (click)="attach()">Attach</button>
    </header>
    @if (error()) {
      <div role="alert" class="p-4">
        <p>{{ error() }}</p>
        <button type="button" class="btn btn-sm" (click)="retry()">Retry</button>
      </div>
    } @else if (!scopeHandler.scope()) {
      <p role="status" class="p-4">Resolving Git scope…</p>
    }
    @if (shell()) {
      <ng-container *ngComponentOutlet="shell()" />
    }
  `,
})
export class GitWindowComponent {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly store = inject(GitDockScopeStore);
  private readonly destroyRef = inject(DestroyRef);
  public readonly scopeHandler = inject(GitWindowScopeHandler);
  public readonly error = signal<string | null>(null);
  public readonly shell = signal<Type<unknown> | null>(null);
  private destroyed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private abort = new AbortController();

  public constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.abort.abort();
      if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    });
    void this.load();
  }

  public retry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.abort.abort();
    this.abort = new AbortController();
    this.error.set(null);
    void this.load();
  }

  public async attach(): Promise<void> {
    const result = await this.rpc.call('gitWindow:close', {}, { timeout: 10_000 });
    if (!result.success) this.error.set(result.error ?? 'Could not attach the Git dock');
  }

  private async load(): Promise<void> {
    // Materialize the store before any scope is accepted so its mutation gate starts closed.
    void this.store;
    const signal = this.abort.signal;
    for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
      const result = await this.rpc.call('gitWindow:getScope', {}, { timeout: 5_000, signal });
      if (signal.aborted || this.destroyed) return;
      if (result.success) {
        if (result.data !== null && result.data !== undefined) {
          const parsed = GitWindowScopeSchema.safeParse(result.data);
          if (!parsed.success || (
            !this.scopeHandler.apply(parsed.data) &&
            (this.scopeHandler.scope()?.sequence ?? -1) < parsed.data.sequence
          )) {
            this.error.set('The Git scope could not be applied.');
            return;
          }
        }
        try {
          const ReviewShellComponent = await loadReviewShell();
          if (!signal.aborted && !this.destroyed) this.shell.set(ReviewShellComponent);
        } catch {
          if (!signal.aborted && !this.destroyed) this.error.set('The Git view could not be loaded.');
        }
        return;
      }
      if (attempt < 2) {
        await new Promise<void>((resolve) => {
          this.retryTimer = setTimeout(() => { this.retryTimer = null; resolve(); }, 250 * 2 ** attempt);
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      }
    }
    if (!signal.aborted && !this.destroyed) this.error.set('Could not load the Git scope.');
  }
}
