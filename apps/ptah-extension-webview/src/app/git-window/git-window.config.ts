import {
  Injectable, Injector, inject, signal, type ApplicationConfig, type Signal,
  provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, provideZoneChangeDetection,
} from '@angular/core';
import {
  ClaudeRpcService, ElectronLayoutService, GIT_SESSION_SCOPE_SOURCE,
  MESSAGE_HANDLERS, ThemeService, provideMessageRouter, provideVSCodeService,
  type GitSessionScopeCandidate, type GitSessionScopeSource, type MessageHandler,
} from '@ptah-extension/core';
import {
  FileContentChangesService, GIT_WINDOW_CONTEXT, GitBranchesService, GitDockScopeStore,
  GitOperationOutputService, GitStatusService, ReviewDiffService, WorktreeService,
} from '@ptah-extension/git-ui/services';
import {
  GIT_WINDOW_PUSH_TYPES, GitWindowScopeSchema,
  type GitWindowMode, type GitWindowScope,
} from '@ptah-extension/shared';
import { useZoneChangeDetectionFallback } from '../zone-change-detection';

export function mountGitWindowHost(doc: Document): void {
  if (doc.querySelector('ptah-git-window')) return;
  const host = doc.createElement('ptah-git-window');
  const root = doc.querySelector('ptah-root');
  if (root) root.replaceWith(host);
  else doc.body.appendChild(host);
}

@Injectable({ providedIn: 'root' })
export class ChildGitSessionScopeSource implements GitSessionScopeSource {
  private readonly active = signal<GitSessionScopeCandidate | null>(null);
  private readonly open = signal<readonly GitSessionScopeCandidate[]>([]);
  public readonly activeSession: Signal<GitSessionScopeCandidate | null> = this.active.asReadonly();
  public readonly openSessions: Signal<readonly GitSessionScopeCandidate[]> = this.open.asReadonly();

  public candidateForTab(tabId: string): GitSessionScopeCandidate | null {
    return this.open().find((candidate) => candidate.tabId === tabId) ?? null;
  }

  public applyCandidates(scope: GitWindowScope): void {
    this.active.set(scope.active);
    this.open.set(scope.open);
  }
}

@Injectable({ providedIn: 'root' })
export class GitWindowScopeHandler implements MessageHandler {
  public readonly handledMessageTypes = [GIT_WINDOW_PUSH_TYPES.scope] as const;
  private readonly store = inject(GitDockScopeStore);
  private readonly injector = inject(Injector);
  private readonly current = signal<GitWindowScope | null>(null);
  public readonly scope = this.current.asReadonly();

  public handleMessage(message: { type: string; payload?: unknown }): void {
    if (message.type === GIT_WINDOW_PUSH_TYPES.scope) this.apply(message.payload);
  }

  public apply(payload: unknown): boolean {
    const parsed = GitWindowScopeSchema.safeParse(payload);
    if (!parsed.success || (this.current()?.sequence ?? -1) >= parsed.data.sequence) return false;
    // The theme does not depend on the Git scope: follow it also when the store rejects the scope.
    if (parsed.data.themeName !== undefined) this.injector.get(ThemeService).followTheme(parsed.data.themeName);
    if (!this.store.applyWindowScope(parsed.data)) return false;
    this.current.set(parsed.data);
    return true;
  }
}

export const gitWindowConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    useZoneChangeDetectionFallback() ? provideZoneChangeDetection() : provideZonelessChangeDetection(),
    provideVSCodeService(),
    provideMessageRouter(),
    { provide: GIT_SESSION_SCOPE_SOURCE, useExisting: ChildGitSessionScopeSource },
    {
      provide: GIT_WINDOW_CONTEXT,
      useFactory: () => {
        const source = inject(ChildGitSessionScopeSource);
        const rpc = inject(ClaudeRpcService);
        return {
          role: 'child' as const,
          applyCandidates: (scope: GitWindowScope) => source.applyCandidates(scope),
          setMode: async (mode: GitWindowMode, tabId: string | null): Promise<boolean> => {
            const result = await rpc.call('gitWindow:setMode', { mode, tabId }, { timeout: 10_000 });
            return result.success && result.data?.accepted === true;
          },
        };
      },
    },
    // ReviewShell hard-injects this root service. It must not handle workspace pushes.
    ElectronLayoutService,
    { provide: MESSAGE_HANDLERS, useExisting: ClaudeRpcService, multi: true },
    { provide: MESSAGE_HANDLERS, useExisting: GitWindowScopeHandler, multi: true },
    { provide: MESSAGE_HANDLERS, useExisting: GitStatusService, multi: true },
    { provide: MESSAGE_HANDLERS, useExisting: GitBranchesService, multi: true },
    { provide: MESSAGE_HANDLERS, useExisting: WorktreeService, multi: true },
    { provide: MESSAGE_HANDLERS, useExisting: ReviewDiffService, multi: true },
    { provide: MESSAGE_HANDLERS, useExisting: FileContentChangesService, multi: true },
    { provide: MESSAGE_HANDLERS, useExisting: GitOperationOutputService, multi: true },
  ],
};
