/**
 * Parse the Kimi Code `/coding/v1/models` response into live model rows.
 *
 * Live rows only: nothing is merged from a repository list. The row shape
 * `{id, name?, context_length?}` is not yet confirmed against a signed-in
 * call, so the parser fails closed: a payload whose envelope does not match
 * returns `null` (the caller reports `bad-response`), and a row that does not
 * match is skipped.
 */

import { z } from 'zod';
import type { ProviderModelInfo } from '../../types/rpc/rpc-providers.types';
import { KIMI_CODE_PROVIDER_ENTRY } from './kimi-code-provider-entry';

/** Envelope only, so one malformed row cannot reject the whole list. */
const envelopeSchema = z.object({ data: z.array(z.unknown()).max(1000) });

const rowSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  context_length: z.number().int().nonnegative().optional(),
  contextLength: z.number().int().nonnegative().optional(),
  supports_tool_use: z.boolean().optional(),
  supportsToolUse: z.boolean().optional(),
});

/**
 * @returns The live rows; `[]` when the vendor listed none; `null` when the
 *   envelope does not match, or when rows were listed but none could be read.
 */
export function parseKimiCodeModels(
  payload: unknown,
): ProviderModelInfo[] | null {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) return null;

  const capabilities = KIMI_CODE_PROVIDER_ENTRY.liveModelCapabilities;
  const seen = new Set<string>();
  const models: ProviderModelInfo[] = [];
  for (const raw of envelope.data.data) {
    const row = rowSchema.safeParse(raw);
    if (!row.success || seen.has(row.data.id)) continue;
    seen.add(row.data.id);
    const name = row.data.name || row.data.id;
    const toolUse = row.data.supports_tool_use ?? row.data.supportsToolUse;
    models.push({
      id: row.data.id,
      name,
      description: `${name} (Kimi Code subscription)`,
      contextLength: row.data.context_length ?? row.data.contextLength ?? 0,
      supportsToolUse: toolUse ?? false,
      ...(toolUse === undefined ? { toolUseUnknown: true as const } : {}),
      ...(capabilities ? { capabilities: [...capabilities] } : {}),
    });
  }
  if (models.length === 0 && envelope.data.data.length > 0) return null;
  return models;
}
