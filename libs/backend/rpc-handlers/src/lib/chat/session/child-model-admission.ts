import { closestLiveModel, getAnthropicProvider } from '@ptah-extension/shared';
import type { SdkModelService } from '@ptah-extension/agent-sdk';
import type { Logger } from '@ptah-extension/vscode-core';

const NATIVE_TIERS = ['opus', 'sonnet', 'haiku'] as const;

type NativeTier = (typeof NATIVE_TIERS)[number];

function isNativeTier(model: string): model is NativeTier {
  return (NATIVE_TIERS as readonly string[]).includes(model);
}

/** Match the native login boundary used by child model listing and admission. */
export function isNativeChildModelProfile(
  profile:
    | Pick<
        Parameters<SdkModelService['getModelsForProviderProfile']>[0],
        'authEnv'
      >
    | null
    | undefined,
): boolean {
  return Boolean(
    profile &&
    !profile.authEnv.ANTHROPIC_BASE_URL &&
    !profile.authEnv.ANTHROPIC_API_KEY &&
    !profile.authEnv.ANTHROPIC_AUTH_TOKEN,
  );
}

/** The native login's own catalog ids; nothing is added from the repository. */
export function nativeChildModelIds(
  catalog: readonly { readonly value: string }[],
): string[] {
  return [...new Set(catalog.map((model) => model.value))];
}

/**
 * The newest `claude-<family>-<n>[-<n>...]` id in the catalog, by numeric
 * compare; ids with a `[...]` suffix or any other tail are not candidates.
 */
function newestFamilyId(
  family: string,
  catalogIds: readonly string[],
): string | undefined {
  const pattern = new RegExp(`^claude-${family}-\\d+(?:-\\d+)*$`);
  return catalogIds
    .filter((id) => pattern.test(id))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0];
}

/**
 * Resolve a native alias against the live catalog.
 *
 * - `opus` / `sonnet` / `haiku`: the `claude-cli` tier preference when the
 *   catalog lists it, else the closest live id to that preference
 *   (`closestLiveModel`), else the newest `claude-<tier>-*` in the catalog,
 *   else the alias unchanged.
 * - `fable`: the newest `claude-fable-*` in the catalog, else the alias.
 * - Anything else: unchanged.
 *
 * Tier preferences never admit a model (D6): every result other than the
 * alias itself is a catalog id. A preference replaced by another id is
 * logged at `warn` with both ids.
 */
export function resolveNativeTierAlias(
  model: string,
  catalogIds: readonly string[],
  logger?: Pick<Logger, 'warn'>,
): string {
  if (model === 'fable') return newestFamilyId('fable', catalogIds) ?? model;
  if (!isNativeTier(model)) return model;

  const preferred = getAnthropicProvider('claude-cli')?.defaultTiers?.[model];
  if (preferred && catalogIds.includes(preferred)) return preferred;
  const resolved =
    (preferred ? closestLiveModel(preferred, catalogIds) : null) ??
    newestFamilyId(model, catalogIds);
  if (!resolved) return model;
  if (preferred) {
    logger?.warn(
      '[ChildModelAdmission] Native tier preference is not live; using the live catalog id',
      { tier: model, preferred, resolved },
    );
  }
  return resolved;
}

/** Use the same provider boundary for child ranking and explicit admission. */
export async function childModelIds(
  catalog: SdkModelService,
  profile:
    Parameters<SdkModelService['getModelsForProviderProfile']>[0] | undefined,
): Promise<string[]> {
  const native = isNativeChildModelProfile(profile);
  const models = native
    ? await catalog.getNativeClaudeModels()
    : profile
      ? await catalog.getModelsForProviderProfile(profile)
      : await catalog.getSupportedModels();
  return native
    ? nativeChildModelIds(models)
    : models.map((item) => item.value);
}
