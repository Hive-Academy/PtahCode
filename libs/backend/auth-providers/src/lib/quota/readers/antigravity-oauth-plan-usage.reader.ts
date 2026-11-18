/** Antigravity ACP profile quota. A missing profile leaves the local probe in charge. */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Logger } from '@ptah-extension/vscode-core';
import type { PlanLimitWindow, PlanWindowKind } from '@ptah-extension/shared';
import type { PlanUsageReading, UsageFailureReason, UsageSourceLabel } from './plan-usage-reader.types';

const TokenSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  refresh_token: z.string().min(1),
  project_id: z.string().optional(),
});
const RefreshSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});
const QuotaSchema = z.object({
  remainingFraction: z.number().finite().min(0).max(1).optional(),
  resetTime: z.string().optional(),
});
const BucketSchema = QuotaSchema.extend({
  bucketId: z.string().min(1),
  window: z.string().optional(),
  displayName: z.string().optional(),
  disabled: z.boolean().optional(),
});
const SummarySchema = z.object({
  groups: z
    .array(
      z.object({
        displayName: z.string().optional(),
        buckets: z.array(BucketSchema).optional(),
      }),
    )
    .optional(),
  buckets: z.array(BucketSchema).optional(),
});
const ModelsSchema = z.object({
  models: z.record(
    z.string(),
    z.object({
      modelProvider: z.string().optional(),
      quotaInfo: QuotaSchema.optional(),
      weeklyQuotaInfo: QuotaSchema.optional(),
    }),
  ),
});
export interface AntigravitySourceFailure {
  readonly source: UsageSourceLabel;
  readonly reason: UsageFailureReason;
  readonly cause: 'missing-token-file' | 'invalid-grant' | 'http-rejection' |
    'schema-mismatch' | 'timeout' | 'missing-local-server' | 'account-mismatch' |
    'request-failed' | 'source-unavailable';
  readonly httpStatus?: number;
}
export type AntigravityUsageReading = PlanUsageReading & {
  readonly sourceFailures?: readonly AntigravitySourceFailure[];
};
export function antigravityFailure(
  source: UsageSourceLabel,
  cause: AntigravitySourceFailure['cause'],
  httpStatus?: number,
): AntigravityUsageReading {
  const reason: UsageFailureReason = cause === 'missing-token-file' ? 'no-oauth'
    : cause === 'invalid-grant' || (cause === 'http-rejection' && (httpStatus === 401 || httpStatus === 403)) ? 'usage-auth-rejected'
    : cause === 'schema-mismatch' || cause === 'http-rejection' ? 'balance-unavailable'
    : cause === 'timeout' ? 'usage-budget-exhausted'
    : cause === 'missing-local-server' ? 'no-local-server'
    : cause === 'account-mismatch' ? 'account-unverified' : 'cli-unavailable';
  return { status: 'service-unavailable',
    statusReason: reason,
    windowSetEstablished: false, windows: [],
    sourceFailures: [{ source, reason, cause, ...(httpStatus !== undefined && { httpStatus }) }] };
}

async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('aborted');
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
const ENDPOINTS = [
  'https://daily-cloudcode-pa.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
];
export const ANTIGRAVITY_OAUTH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 256 * 1024;
let cachedAccess:
  | {
      refreshToken: string;
      fetcher: typeof fetch;
      token: string;
      expiresAt: number;
    }
  | undefined;

async function boundedJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES)
    throw new Error('response too large');
  return JSON.parse(body);
}

export async function readAntigravityOAuthQuota(
  signal?: AbortSignal,
  now: () => number = Date.now,
  fetcher: typeof fetch = fetch,
  readAuth: (path: string, options: { encoding: 'utf8'; signal: AbortSignal }) => Promise<string> = readFile,
  env: NodeJS.ProcessEnv = process.env,
  retryUnauthorized = true,
  logger?: Pick<Logger, 'debug'>,
): Promise<AntigravityUsageReading> {
  const failure = (cause: AntigravitySourceFailure['cause'], status?: number) =>
    antigravityFailure('provider-api', cause, status);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, ANTIGRAVITY_OAUTH_TIMEOUT_MS);
  const bounded = <T>(work: Promise<T>) => abortable(work, controller.signal);
  try {
    if (controller.signal.aborted) return failure('timeout');
    const profile = env['ANTIGRAVITY_HOME']?.trim() ||
      join(env['HOME'] || env['USERPROFILE'] || homedir(), '.gemini');
    let lastFailure = failure('schema-mismatch');
    for (let attempt = 0; attempt < (retryUnauthorized ? 2 : 1); attempt++) {
      let raw: string;
      try {
        raw = await bounded(readAuth(join(profile, 'antigravity-acp', 'acp_token.json'), { encoding: 'utf8', signal: controller.signal }));
      } catch (error: unknown) {
        if (controller.signal.aborted) return failure('timeout');
        return failure(error instanceof Error && 'code' in error && error.code === 'ENOENT'
          ? 'missing-token-file' : 'request-failed');
      }
      let token: z.infer<typeof TokenSchema>;
      try { token = TokenSchema.parse(JSON.parse(raw)); }
      catch (error: unknown) {
        return failure(error instanceof Error ? 'schema-mismatch' : 'request-failed');
      }
      let accessToken = cachedAccess?.refreshToken === token.refresh_token &&
        cachedAccess.fetcher === fetcher ? cachedAccess : undefined;
      if (!accessToken || accessToken.expiresAt <= now()) {
        const refreshed = await bounded(fetcher('https://oauth2.googleapis.com/token', {
          method: 'POST', redirect: 'error', signal: controller.signal,
          body: new URLSearchParams({ client_id: token.client_id, client_secret: token.client_secret,
            refresh_token: token.refresh_token, grant_type: 'refresh_token' }),
        }));
        if (!refreshed.ok) {
          if (refreshed.status === 400) {
            let body: unknown;
            try { body = await bounded(boundedJson(refreshed)); }
            catch (error: unknown) {
              if (controller.signal.aborted) return failure('timeout');
              // degradation-audit: reported — retain the known HTTP status when its body is unreadable.
              logger?.debug('[PlanUsage] OAuth refresh error body unavailable', { cause: error instanceof SyntaxError ? 'schema-mismatch' : 'request-failed', httpStatus: 400 });
            }
            if (z.object({ error: z.string() }).safeParse(body).data?.error === 'invalid_grant') {
              cachedAccess = undefined;
              return failure('invalid-grant', 400);
            }
          }
          return failure('http-rejection', refreshed.status);
        }
        const access = RefreshSchema.safeParse(await bounded(boundedJson(refreshed)));
        if (!access.success) return failure('schema-mismatch');
        accessToken = { refreshToken: token.refresh_token, fetcher, token: access.data.access_token,
          expiresAt: now() + access.data.expires_in * 1000 - 60_000 };
        cachedAccess = accessToken;
      }
      let unauthorized = false;
      for (const operation of ['retrieveUserQuotaSummary', 'fetchAvailableModels'] as const) {
        for (const endpoint of ENDPOINTS) {
          try {
            const observedAt = now();
            const response = await bounded(fetcher(`${endpoint}/v1internal:${operation}`, {
              method: 'POST', headers: { Authorization: `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json' },
              body: JSON.stringify(token.project_id ? { project: token.project_id } : {}),
              redirect: 'error', signal: controller.signal,
            }));
            if (!response.ok) {
              lastFailure = failure('http-rejection', response.status);
              if (response.status === 401) { cachedAccess = undefined; unauthorized = true; break; }
              continue;
            }
            const body = await bounded(boundedJson(response));
            const windows = operation === 'retrieveUserQuotaSummary'
              ? summaryWindows(body, observedAt) : modelWindows(body, observedAt);
            if (windows.length) return { status: 'available', fetchedAt: now(),
              windowSetEstablished: true, windows };
            lastFailure = failure('schema-mismatch');
          } catch (error: unknown) {
            if (controller.signal.aborted || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) return failure('timeout');
            lastFailure = failure(error instanceof SyntaxError || error instanceof z.ZodError ? 'schema-mismatch' : 'request-failed');
            // degradation-audit: reported — another endpoint may still provide quota.
            logger?.debug('[PlanUsage] OAuth endpoint failed; trying next endpoint', { cause: lastFailure.sourceFailures?.[0]?.cause });
          }
        }
        if (unauthorized) break;
      }
      if (!unauthorized) break;
    }
    return lastFailure;
  } catch (error: unknown) {
    return failure(controller.signal.aborted ? 'timeout'
      : error instanceof SyntaxError || error instanceof z.ZodError ? 'schema-mismatch'
      : 'request-failed');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

function quotaWindow(
  key: string,
  kind: PlanWindowKind,
  label: string,
  quota: z.infer<typeof QuotaSchema>,
  observedAt: number,
): PlanLimitWindow | undefined {
  if (quota.remainingFraction === undefined) return undefined;
  const resetsAt = Date.parse(quota.resetTime ?? '');
  return {
    key: `other:${key}`,
    kind,
    label,
    used: { kind: 'percent', percent: (1 - quota.remainingFraction) * 100 },
    usedSource: 'provider-unofficial',
    usedObservedAt: observedAt,
    ...(Number.isFinite(resetsAt) && {
      resetsAt,
      resetSource: 'provider-unofficial' as const,
    }),
    observedAt,
  };
}

function summaryWindows(body: unknown, observedAt: number): PlanLimitWindow[] {
  const parsed = SummarySchema.safeParse(body);
  if (!parsed.success) return [];
  const groups = parsed.data.groups?.some((group) => group.buckets?.length)
    ? parsed.data.groups
    : [{ buckets: parsed.data.buckets }];
  return groups.flatMap((group) =>
    (group.buckets ?? []).flatMap((bucket) => {
      if (bucket.disabled) return [];
      const kind =
        bucket.window === 'weekly'
          ? 'weekly'
          : bucket.window === '5h'
            ? 'five_hour'
            : 'other';
      const window = quotaWindow(
        bucket.bucketId,
        kind,
        bucket.displayName || bucket.bucketId,
        bucket,
        observedAt,
      );
      return window ? [window] : [];
    }),
  );
}

function modelWindows(body: unknown, observedAt: number): PlanLimitWindow[] {
  const parsed = ModelsSchema.safeParse(body);
  if (!parsed.success) return [];
  return Object.entries(parsed.data.models).flatMap(([id, model]) => {
    const family = id.startsWith('gemini-')
      ? 'Gemini'
      : id.startsWith('claude-')
        ? 'Claude'
        : id.startsWith('gpt-')
          ? 'GPT'
          : undefined;
    if (!family) return [];
    return (
      [
        ['quota', 'other', model.quotaInfo],
        ['weekly', 'weekly', model.weeklyQuotaInfo],
      ] as const
    ).flatMap(([suffix, kind, quota]) => {
      if (!quota) return [];
      const window = quotaWindow(
        `${id}-${suffix}`,
        kind,
        `${family} · ${suffix}`,
        quota,
        observedAt,
      );
      return window ? [window] : [];
    });
  });
}
