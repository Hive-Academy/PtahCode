import { z } from 'zod';
import type { ProviderModelInfo } from '../../types/rpc/rpc-providers.types';
import {
  KIMI_CODE_MODEL_CAPABILITIES,
  KIMI_CODE_PROVIDER_ENTRY,
} from './kimi-code-provider-entry';

const liveModelsSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        context_length: z.number().int().nonnegative().optional(),
        contextLength: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1),
});

/** True when the payload has the model list shape that the merge accepts. */
export function isKimiCodeModelsPayload(payload: unknown): boolean {
  return liveModelsSchema.safeParse(payload).success;
}

/** Keep all static models and append distinct live-only ids. The live id namespace has not yet been observed. */
export function mergeKimiCodeModels(payload: unknown): ProviderModelInfo[] {
  const staticModels = KIMI_CODE_PROVIDER_ENTRY.staticModels ?? [];
  const result: ProviderModelInfo[] = staticModels.map((model) => ({
    ...model,
    capabilities: model.capabilities ? [...model.capabilities] : undefined,
  }));
  const parsed = liveModelsSchema.safeParse(payload);
  if (!parsed.success) return result;

  const seen = new Set(staticModels.map((model) => model.id));
  for (const model of staticModels) {
    const bracket = model.id.lastIndexOf('[');
    if (bracket > 0 && model.id.endsWith(']')) {
      seen.add(model.id.slice(0, bracket));
    }
  }
  for (const live of parsed.data.data) {
    if (!seen.has(live.id)) {
      const name = live.name || live.id;
      result.push({
        id: live.id,
        name,
        description: `${name} (Kimi Code subscription)`,
        contextLength: live.context_length ?? live.contextLength ?? 0,
        supportsToolUse: true,
        capabilities: [...KIMI_CODE_MODEL_CAPABILITIES],
      });
      seen.add(live.id);
    }
  }
  return result;
}
