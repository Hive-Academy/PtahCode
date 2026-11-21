import type { EffortLevel } from './ai-provider.types';
import type { SessionId } from './branded.types';
import type { PermissionLevel } from './model-autopilot.types';
import type { ProviderSessionProfileId } from './provider-session-profile.types';

export type SessionRuntimeKind =
  | 'claude-sdk'
  | 'codex-app-server'
  | 'provider-session';

interface SessionRuntimeIdentityBase {
  readonly version: 1;
  readonly sessionId: SessionId;
  readonly providerId: string;
  readonly workspaceId: string;
}

/**
 * Persisted runtime binding; Codex homes are already normalized by the host.
 * A provider-session binding names its profile; `normalizedHome` is set only
 * for a profile that runs against an isolated home.
 */
export type SessionRuntimeIdentity = SessionRuntimeIdentityBase &
  (
    | {
        readonly runtime: 'claude-sdk';
        readonly codex?: never;
        readonly providerSession?: never;
      }
    | {
        readonly runtime: 'codex-app-server';
        readonly codex: { readonly normalizedHome: string };
        readonly providerSession?: never;
      }
    | {
        readonly runtime: 'provider-session';
        readonly providerSession: {
          readonly profile: ProviderSessionProfileId;
          readonly normalizedHome?: string;
        };
        readonly codex?: never;
      }
  );

export type SessionRuntimeIdentityMismatchField =
  | 'providerId'
  | 'workspaceId'
  | 'runtime'
  | 'profile'
  | 'normalizedHome';

/** Compare resume bindings in stable priority order, not their session IDs. */
export function sessionRuntimeIdentityMismatch(
  a: SessionRuntimeIdentity,
  b: SessionRuntimeIdentity,
): SessionRuntimeIdentityMismatchField | null {
  if (a.providerId !== b.providerId) return 'providerId';
  if (a.workspaceId !== b.workspaceId) return 'workspaceId';
  if (a.runtime !== b.runtime) return 'runtime';
  if (a.providerSession?.profile !== b.providerSession?.profile)
    return 'profile';
  if (
    (a.codex ?? a.providerSession)?.normalizedHome !==
    (b.codex ?? b.providerSession)?.normalizedHome
  )
    return 'normalizedHome';
  return null;
}

export interface RuntimeHostCapabilities {
  readonly nativeCodex: boolean;
  /**
   * Native Codex for messaging-gateway turns. Absent means false; the host
   * computes this from the gateway parity gate or the dev override.
   * `nativeCodex` continues to gate main chat.
   */
  readonly nativeCodexGateway?: boolean;
  /**
   * Provider-session profiles this host can run as a main-chat runtime.
   * Absent or empty means none; a profile not listed is refused.
   */
  readonly providerSessions?: readonly ProviderSessionProfileId[];
}

export type RuntimeConsumer = 'chat' | 'gateway' | 'lane';

/** Credential-free seed: never carries tokens, env, proxy URLs or headers. */
export interface CodexProfileSeed {
  readonly providerId: 'openai-codex';
  readonly consumer: RuntimeConsumer;
  readonly workspacePath: string;
  /** Case-preserving resolved path. */
  readonly home: string;
  /** Normalized identity key. */
  readonly normalizedHome: string;
  readonly model: string;
  readonly existingIdentity?: SessionRuntimeIdentity;
}

/**
 * Credential-free seed for a provider-session chat: never carries tokens,
 * env, MCP headers or proxy URLs. `model` is absent when the provider's own
 * default applies (tier aliases and `default` never map to Claude ids).
 */
export interface ProviderSessionSeed {
  readonly providerId: string;
  readonly profile: ProviderSessionProfileId;
  readonly consumer: Extract<RuntimeConsumer, 'chat'>;
  readonly workspacePath: string;
  /** Normalized identity key of `workspacePath`. */
  readonly workspaceId: string;
  readonly model?: string;
  readonly existingIdentity?: SessionRuntimeIdentity;
}

export interface AppliedSettings {
  readonly timing: 'effectiveNow' | 'nextTurn';
  readonly revision: number;
}

/** Bound controls own persistence, including save-only changes for inactive sessions. */
export interface SessionRuntimeControlOptions {
  readonly applyTo?: 'global' | 'app' | 'workspace';
  /** Preserve the configured level when autopilot is disabled (live level is ask). */
  readonly autopilot?: { readonly enabled: boolean; readonly permissionLevel: PermissionLevel };
}

export interface SessionRuntimeControls {
  setPermission(
    sessionId: SessionId,
    level: PermissionLevel,
    options?: SessionRuntimeControlOptions,
  ): Promise<AppliedSettings>;
  setModel(sessionId: SessionId, model: string, options?: SessionRuntimeControlOptions): Promise<AppliedSettings>;
  setEffort(
    sessionId: SessionId,
    effort: EffortLevel | undefined,
    options?: SessionRuntimeControlOptions,
  ): Promise<AppliedSettings>;
  interrupt(sessionId: SessionId): Promise<boolean>;
  compact(sessionId: SessionId): Promise<void>;
}

export type SessionApprovalDecision =
  'accept' | 'acceptForSession' | 'decline' | 'cancel';

export interface PermissionPromptCancelledPayload {
  readonly sessionId: string;
  readonly requestId: string;
  readonly reason: 'timeout' | 'disposed' | 'turn-ended' | 'superseded';
}
