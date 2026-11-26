import type { PermissionLevel } from '@ptah-extension/shared';

export interface LiveChatSession {
  readonly runtime: 'claude-sdk' | 'codex-app-server' | 'provider-session';
  readonly sessionId: string;
  readonly sessionName?: string;
  readonly tabId?: string;
  readonly workspaceRoot?: string;
  readonly cwd?: string;
  readonly model?: string;
  readonly permissionLevel?: PermissionLevel;
}

export type LiveChatSessionResolution =
  | { readonly kind: 'resolved'; readonly session: LiveChatSession }
  | { readonly kind: 'unresolved' | 'ambiguous' };

export interface LiveChatSessionResolver {
  resolve(callerId: string): LiveChatSessionResolution;
}
