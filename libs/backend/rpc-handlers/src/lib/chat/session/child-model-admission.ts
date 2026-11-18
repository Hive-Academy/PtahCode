import { getAnthropicProvider } from '@ptah-extension/shared';
import type { SdkModelService } from '@ptah-extension/agent-sdk';

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

/** Keep discovered IDs while admitting the repository's verified native IDs. */
export function nativeChildModelIds(
  catalog: readonly { readonly value: string }[],
): string[] {
  const provider = getAnthropicProvider('claude-cli');
  return [
    ...new Set([
      ...catalog.map((model) => model.value),
      ...(provider?.staticModels ?? []).map((model) => model.id),
      ...Object.values(provider?.defaultTiers ?? {}),
    ]),
  ];
}

/** Resolve native aliases independently of a potentially stale SDK catalog. */
export function resolveNativeTierAlias(model: string): string {
  const provider = getAnthropicProvider('claude-cli');
  if (model === 'opus' || model === 'sonnet' || model === 'haiku') {
    return provider?.defaultTiers?.[model] ?? model;
  }
  if (model === 'fable') {
    return (
      (provider?.staticModels ?? [])
        .map((entry) => entry.id)
        .filter((id) => /^claude-fable-\d+(?:-\d+)*$/.test(id))
        .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0] ?? model
    );
  }
  return model;
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
