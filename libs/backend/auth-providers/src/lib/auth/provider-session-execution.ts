/**
 * The provider-session branch of `WorkspaceProviderProfileResolver`: which
 * provider session a chat resolves to, and its credential-free seed. Pure
 * apart from the registry reads, so the resolver only delegates.
 */
import { AuthRequiredError } from '@ptah-extension/agent-sdk';
import { normalizeCodexWorkspaceKey } from '@ptah-extension/codex-runtime';
import {
  getAnthropicProvider,
  getProviderSessionProfile,
  sessionRuntimeIdentityMismatch,
  type ProviderSessionProfileId,
} from '@ptah-extension/shared';
import { isClaudeModel, type CachedModelIdsReader } from './stored-model-offer';
import type {
  ExecutionProfileRequest,
  ResolvedExecutionProfile,
} from './workspace-provider-profile-resolver';

/** The provider-session provider and profile a chat resolves to. */
export interface ProviderSessionTarget {
  readonly providerId: string;
  readonly profile: ProviderSessionProfileId;
}

/**
 * A stored provider-session binding, or a new session whose workspace's
 * active provider is a provider-session entry. Any other stored identity
 * keeps its own runtime. `activeProviderId` is read only for a new session.
 */
export function providerSessionTargetOf(
  input: ExecutionProfileRequest,
  activeProviderId: () => string,
): ProviderSessionTarget | undefined {
  const { existingIdentity } = input;
  if (existingIdentity?.runtime === 'provider-session') {
    return {
      providerId: existingIdentity.providerId,
      profile: existingIdentity.providerSession.profile,
    };
  }
  if (existingIdentity) return undefined;
  const providerId = activeProviderId();
  const profile = getProviderSessionProfile(providerId);
  return profile ? { providerId, profile } : undefined;
}

/**
 * Credential-free seed for a provider-session chat. Only the main chat may
 * run one (A9: gateway and lanes are refused), only on a host that lists
 * the profile, and a resume must match the stored binding.
 */
export function resolveProviderSessionExecution(
  input: ExecutionProfileRequest,
  target: ProviderSessionTarget,
  cachedModelIds: CachedModelIdsReader,
): Extract<ResolvedExecutionProfile, { runtime: 'provider-session' }> {
  const { workspacePath, requestedModel, existingIdentity } = input;
  const { providerId, profile } = target;
  const name = getAnthropicProvider(providerId)?.name ?? providerId;
  if (input.consumer !== 'chat') {
    const recoveryHint =
      'Choose another provider for this workspace in Settings and retry.';
    throw new AuthRequiredError(
      `${name} runs only in Ptah's main chat; messaging-gateway and lane turns cannot use it. ${recoveryHint}`,
      { providerId, recoveryHint },
    );
  }
  if (!input.hostCapabilities.providerSessions?.includes(profile)) {
    throw new AuthRequiredError(
      `This session requires a host with ${name} support.`,
      {
        providerId,
        recoveryHint: `Use the Ptah desktop app with ${name} installed, or choose another provider in Settings.`,
      },
    );
  }
  const resume =
    existingIdentity?.runtime === 'provider-session'
      ? existingIdentity
      : undefined;
  let workspaceId: string;
  let storedWorkspaceId: string | undefined;
  try {
    // The Codex workspace key is the lexical identity key for every native
    // runtime: case-folded on win32, roots kept, drive-less rooted paths
    // refused, idempotent.
    workspaceId = normalizeCodexWorkspaceKey(workspacePath, process.platform);
    if (resume) {
      storedWorkspaceId = normalizeCodexWorkspaceKey(
        resume.workspaceId,
        process.platform,
      );
    }
  } catch {
    // Not a sign-in problem: no providerId, like the Codex equivalent.
    throw new AuthRequiredError(
      `Cannot use ${name} session: workspaceId is invalid.`,
    );
  }
  if (resume) {
    // The stored provider must still name the same profile on this build.
    const currentProfile = getProviderSessionProfile(resume.providerId);
    const mismatch = currentProfile
      ? sessionRuntimeIdentityMismatch(
          { ...resume, workspaceId: storedWorkspaceId ?? workspaceId },
          {
            ...resume,
            workspaceId,
            providerSession: { profile: currentProfile },
          },
        )
      : 'profile';
    if (mismatch) {
      throw new AuthRequiredError(
        `Cannot resume ${name} session: ${mismatch} changed.`,
      );
    }
  }
  const model = providerSessionModel(
    cachedModelIds(providerId),
    requestedModel,
    input.requestedModelIsStored === true,
  );
  return {
    runtime: 'provider-session',
    seed: {
      providerId,
      profile,
      consumer: 'chat',
      workspacePath,
      workspaceId,
      ...(model !== undefined ? { model } : {}),
      ...(existingIdentity ? { existingIdentity } : {}),
    },
  };
}

/**
 * The model a provider session starts on; `undefined` is the provider's own
 * default. Blank, Claude aliases and Claude ids never pass. With a cached
 * catalog only an offered id passes. Without one, an explicit choice passes
 * (the provider is the authority on it) and a stored setting does not: it
 * was saved for another provider's slot.
 */
function providerSessionModel(
  catalog: readonly string[] | null,
  requestedModel: string,
  isStored: boolean,
): string | undefined {
  const requested = requestedModel.trim();
  if (!requested || isClaudeModel(requested)) return undefined;
  if (catalog) return catalog.includes(requested) ? requested : undefined;
  return isStored ? undefined : requested;
}
