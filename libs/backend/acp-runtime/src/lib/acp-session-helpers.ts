/**
 * Pure helpers of the ACP session runtime: the usage schemas the prompt
 * response and `usage_update` carry, and defensive readers for agent
 * responses (which the runtime does not validate as a whole).
 */
import type { SessionNotification } from '@agentclientprotocol/sdk';
import { z } from 'zod';
import type { AcpProcessExit } from './acp-process-transport';

/** ACP prompt response extension; reject malformed counters without failing the turn. */
export const acpPromptUsageSchema = z
  .object({
    model: z.string().optional(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative().optional(),
    cacheWriteTokens: z.number().int().nonnegative().optional(),
    contextTokens: z.number().int().nonnegative().optional(),
    costUsd: z.number().finite().nonnegative().optional(),
  })
  .passthrough();

export const acpUsageUpdateSchema = z
  .object({
    sessionUpdate: z.literal('usage_update'),
    used: z.number().int().nonnegative(),
    _meta: z
      .object({ usage: acpPromptUsageSchema.optional() })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export interface JsonRpcErrorShape {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The JSON-RPC error carried by a rejected request, if it is one (SDK `RequestError`). */
export function readJsonRpcError(error: unknown): JsonRpcErrorShape | undefined {
  if (!(error instanceof Error)) return undefined;
  const { code, data } = error as Error & { code?: unknown; data?: unknown };
  if (typeof code !== 'number') return undefined;
  return { code, message: error.message, data };
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The session's advertised config options, read defensively (agent responses are not validated). */
export function readConfigOptions(
  response: unknown,
): readonly Record<string, unknown>[] {
  if (!isRecord(response) || !Array.isArray(response['configOptions'])) {
    return [];
  }
  return response['configOptions'].filter(isRecord);
}

/** The mode ids a session advertised in `modes.availableModes`, read defensively. */
export function readModeIds(response: unknown): readonly string[] {
  if (!isRecord(response) || !isRecord(response['modes'])) return [];
  const available = response['modes']['availableModes'];
  if (!Array.isArray(available)) return [];
  return available.flatMap((mode: unknown) =>
    isRecord(mode) && typeof mode['id'] === 'string' ? [mode['id']] : [],
  );
}

/** The values a select option offers, flattening grouped options. */
export function advertisedValuesOf(option: Record<string, unknown>): string[] {
  const entries = Array.isArray(option['options']) ? option['options'] : [];
  return entries.flatMap((entry: unknown): string[] => {
    if (!isRecord(entry)) return [];
    if (typeof entry['value'] === 'string') return [entry['value']];
    if (Array.isArray(entry['options'])) {
      return entry['options'].flatMap((inner: unknown) =>
        isRecord(inner) && typeof inner['value'] === 'string'
          ? [inner['value']]
          : [],
      );
    }
    return [];
  });
}

/** Whether a `session/update` is history replayed by `session/load`. */
export function isReplayedUpdate(notification: SessionNotification): boolean {
  const meta: unknown = notification._meta;
  if (isRecord(meta) && meta['isReplay'] === true) return true;
  const update: unknown = notification.update;
  return (
    isRecord(update) &&
    isRecord(update['_meta']) &&
    update['_meta']['isReplay'] === true
  );
}

export function describeExit(exit: AcpProcessExit): string {
  if (exit.code !== null) return `code ${exit.code}`;
  if (exit.signal) return `signal ${exit.signal}`;
  return 'code unknown';
}
