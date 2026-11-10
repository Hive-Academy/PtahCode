import type {
  GitWindowOpenResult,
  GitWindowPublishScopeResult,
  GitWindowScope,
  GitWindowSetModeParams,
} from '@ptah-extension/shared';

/**
 * Electron-only detached Git window port. The Electron adapter binds this
 * token after IPC startup. Other platforms leave it unbound; their RPC handler
 * answers open with `{ ok: false, reason: 'not-ready' }`, close/status with
 * `false`, publish with `{ accepted: false, scope: null }`, getScope with
 * `null`, and setMode with `{ accepted: false }`.
 *
 * The main renderer supplies scope with provisional sequence 0. The host owns
 * the monotonic sequence and returns the accepted scope to the caller.
 */
export interface GitWindowHost {
  /** Opens or focuses the singleton child. */
  open(): Promise<GitWindowOpenResult>;
  /** Closes the child, returning whether one was open. */
  close(): Promise<boolean>;
  isOpen(): boolean;
  /** Validates, caches, sequences and pushes the scope. */
  publishScope(scope: GitWindowScope): GitWindowPublishScopeResult;
  getScope(): GitWindowScope | null;
  /** Relays a child mode request to the main renderer. */
  setMode(params: GitWindowSetModeParams): boolean;
}
