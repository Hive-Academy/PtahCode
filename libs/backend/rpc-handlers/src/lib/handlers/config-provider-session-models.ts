/**
 * `config:models-list` for a provider-session provider (Antigravity, later
 * Grok and OpenCode).
 *
 * Such a provider never serves the Claude SDK, so the SDK tier slots and the
 * Anthropic catalog the handler lists for every other provider are the wrong
 * models: the composer offered "Default (recommended) / Opus / Sonnet / Haiku"
 * for an Antigravity session (live test). The picker lists the provider's own
 * CLI catalog instead (the same source as `provider:listModels`), which also
 * warms the cached catalog the provider-session model resolution reads.
 */
import {
  getAnthropicProvider,
  type ProviderModelInfo,
  type SdkModelInfo,
} from '@ptah-extension/shared';

/** The provider catalog read: `ProviderModelsService.fetchModels`. */
export type ProviderCatalogReader = (
  providerId: string,
) => Promise<{ models: readonly ProviderModelInfo[] }>;

/** The `default` entry: the provider picks its own model. */
export function providerDefaultModelName(providerId: string): string {
  const name = getAnthropicProvider(providerId)?.name ?? providerId;
  return `Default (chosen by ${name})`;
}

/**
 * Picker entries for a provider-session provider: `default` first, then the
 * provider's catalog. Exactly one entry is selected: the saved model when the
 * catalog (or the saved value itself, while the catalog is unavailable) names
 * it, else `default`. A catalog failure lists only `default` and the saved
 * model, so the composer still shows the user's choice.
 */
export async function providerSessionModelOptions(
  providerId: string,
  savedModel: string,
  readCatalog: ProviderCatalogReader,
  onCatalogFailure: (error: Error) => void,
): Promise<SdkModelInfo[]> {
  const saved = savedModel.trim();
  let catalog: readonly ProviderModelInfo[] = [];
  let catalogFailed = false;
  try {
    catalog = (await readCatalog(providerId)).models;
  } catch (error: unknown) {
    // degradation-audit: reported - the picker falls back to `default` plus
    // the saved model; the caller logs the failure.
    catalogFailed = true;
    onCatalogFailure(error instanceof Error ? error : new Error(String(error)));
  }
  const models: SdkModelInfo[] = [
    {
      id: 'default',
      name: providerDefaultModelName(providerId),
      description: '',
      isSelected: false,
      providerModelId: null,
    },
  ];
  const seen = new Set<string>(['default']);
  for (const model of catalog) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    models.push({
      id: model.id,
      name: model.name || model.id,
      description: model.description ?? '',
      isSelected: false,
      providerModelId: null,
    });
  }
  // Only while the catalog is unavailable: a saved id the live catalog no
  // longer offers is not invented into the list.
  if (
    saved &&
    !seen.has(saved) &&
    (catalogFailed || catalog.length === 0)
  ) {
    models.push({
      id: saved,
      name: saved,
      description: '',
      isSelected: false,
      providerModelId: null,
    });
  }
  const selected = models.findIndex((model) => model.id === saved);
  models[selected === -1 ? 0 : selected].isSelected = true;
  return models;
}
