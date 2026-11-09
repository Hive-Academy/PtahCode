/**
 * Local Ollama loads a decision model on the first `/v1/systemone` call.
 * That load is part of the same HTTP request the 3000 ms inference budget
 * aborts. Aborting cancels the load, so the next call (pre-flight, then
 * gate-0.1) is cold again and also exceeds 3000 ms.
 *
 * A residency probe (`GET /api/ps`) tells those apart. A model that is not
 * loaded gets the load budget; a model that is already loaded keeps the
 * inference budget, so a genuinely slow call still falls back. `keep_alive`
 * on the decision request stops the daemon from unloading the model after
 * its default five minutes.
 */
import { z } from 'zod';

import { systemOneUrl } from './decision-endpoint.url';

/** How long a local daemon should keep the decision model loaded. */
export const SYSTEM_ONE_KEEP_ALIVE = '30m';

/**
 * Abort budget for a decision request whose model is not loaded, and only
 * when no `decisionModelTimeoutMs` is saved. A saved timeout bounds every
 * request. Warm inference stays on the per-request budget (3000 ms by
 * default). Matches the longest decision-model timeout the settings allow.
 */
export const SYSTEM_ONE_LOAD_TIMEOUT_MS = 60_000;

/** The residency probe must not consume the decision budget. */
export const SYSTEM_ONE_RESIDENCY_PROBE_TIMEOUT_MS = 1_000;

/** Ollama's list of models currently in memory. */
export const OLLAMA_PS_PATH = '/api/ps';

const RunningModelSchema = z
  .object({
    name: z.string().optional(),
    model: z.string().optional(),
  })
  .passthrough();

const PsBodySchema = z
  .object({
    models: z.array(RunningModelSchema).optional(),
  })
  .passthrough();

export interface RequestBudgetInput {
  readonly warmMs: number;
  readonly coldMs: number | undefined;
  /** `null` when the probe did not answer. Only a definite miss uses `coldMs`. */
  readonly resident: boolean | null;
}

/** `coldMs` only when the probe proved the model is not loaded. */
export function selectRequestBudgetMs(input: RequestBudgetInput): number {
  if (
    input.resident === false &&
    input.coldMs !== undefined &&
    input.coldMs > input.warmMs
  ) {
    return input.coldMs;
  }
  return input.warmMs;
}

/** `GET /api/ps` for a daemon base URL, or `null` when the base cannot be joined. */
export function ollamaPsUrl(baseUrl: string): string | null {
  const url = systemOneUrl(baseUrl, OLLAMA_PS_PATH);
  return URL.canParse(url) ? url : null;
}

/**
 * Whether `requested` is one of the models Ollama reports as loaded.
 * A name without a tag matches only `name:latest` (`nimble` matches
 * `nimble:latest`, not `nimble:v1`).
 * `null` when the body is not a process list.
 */
export function residentFromPsBody(
  body: string,
  requested: string,
): boolean | null {
  const parsed = readJson(body);
  if (!parsed.ok) return null;
  const validated = PsBodySchema.safeParse(parsed.value);
  if (!validated.success || validated.data.models === undefined) return null;
  return validated.data.models.some((entry) =>
    labelMatches(entry.name, requested) || labelMatches(entry.model, requested),
  );
}

function labelMatches(label: string | undefined, requested: string): boolean {
  if (label === undefined || requested.length === 0) return false;
  if (label === requested) return true;
  // Ollama resolves an untagged name to `:latest`, never to another tag.
  return !requested.includes(':') && label === `${requested}:latest`;
}

function readJson(
  body: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}
