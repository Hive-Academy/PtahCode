/**
 * Parser for OpenAI/OpenRouter-style `/v1/models` rows.
 *
 * The rows come from a third-party endpoint, so each one is validated on its
 * own: an invalid row is skipped and the rest are kept. Field conventions
 * covered:
 *
 * - OpenRouter: `name`, `context_length`, `supported_parameters`, `pricing`
 *   as an object of per-token price strings.
 * - Requesty: `supports_tool_calling`, top-level `input_price` /
 *   `output_price`, `pricing` as an array of price tiers (ignored).
 * - Anthropic: `display_name`, no tool or price fields.
 *
 * A row that reports no tool support either way gets `supportsToolUse: false`
 * plus `toolUseUnknown: true`: unknown is not "no". Provider capabilities are
 * applied by the caller, not here.
 */

import type { ProviderModelInfo } from '@ptah-extension/shared';

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function positiveFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * Parse a price field. OpenRouter sends strings (`"0.000005"` = $5 / 1M
 * tokens); Requesty sends numbers.
 *
 * @returns the price, or undefined when empty, invalid, non-finite or negative
 */
function parsePricingField(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function toolSupport(
  row: Row,
): Pick<ProviderModelInfo, 'supportsToolUse' | 'toolUseUnknown'> {
  const params = row['supported_parameters'];
  if (Array.isArray(params)) {
    return { supportsToolUse: params.includes('tools') };
  }
  const flag = row['supports_tool_calling'];
  if (typeof flag === 'boolean') return { supportsToolUse: flag };
  return { supportsToolUse: false, toolUseUnknown: true };
}

function parseRow(row: Row): ProviderModelInfo {
  const id = row['id'] as string;
  const pricing = isRow(row['pricing']) ? row['pricing'] : undefined;
  const contextLength =
    positiveFinite(row['context_length']) ??
    positiveFinite(row['context_window']);
  const prices = {
    inputCostPerToken:
      parsePricingField(pricing?.['prompt']) ??
      parsePricingField(row['input_price']),
    outputCostPerToken:
      parsePricingField(pricing?.['completion']) ??
      parsePricingField(row['output_price']),
    cacheReadCostPerToken: parsePricingField(pricing?.['input_cache_read']),
    cacheCreationCostPerToken: parsePricingField(
      pricing?.['input_cache_write'],
    ),
  };
  return {
    id,
    name:
      nonEmptyString(row['name']) ?? nonEmptyString(row['display_name']) ?? id,
    description: nonEmptyString(row['description']) ?? '',
    contextLength: contextLength ?? 0,
    ...(contextLength !== undefined && {
      contextLengthSource: 'provider' as const,
    }),
    ...toolSupport(row),
    ...Object.fromEntries(
      Object.entries(prices).filter(([, price]) => price !== undefined),
    ),
  };
}

/**
 * Map `/v1/models` `data` rows to model info. Rows that are not objects or
 * have no non-empty string `id` are skipped.
 */
export function parseModelsApiRows(rows: unknown[]): ProviderModelInfo[] {
  const models: ProviderModelInfo[] = [];
  for (const row of rows) {
    if (!isRow(row) || !nonEmptyString(row['id'])) continue;
    models.push(parseRow(row));
  }
  return models;
}
