/** Default grok.com login billing, separate from local session accounting. */
import { readFile } from 'node:fs/promises';
import { types } from 'node:util';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Logger } from '@ptah-extension/vscode-core';
import type { PlanLimitWindow } from '@ptah-extension/shared';
import type {
  PlanUsageReader,
  PlanUsageReading,
} from './plan-usage-reader.types';

export const GROK_BILLING_URL =
  'https://cli-chat-proxy.grok.com/v1/billing?format=credits';
const CredentialSchema = z.record(
  z.string(),
  z.object({
    key: z.string().optional(),
    auth_mode: z.string().optional(),
    email: z.string().optional(),
  }),
);
const BillingSchema = z.object({
  config: z
    .object({
      creditUsagePercent: z.number().finite().optional(),
      prepaidBalance: z.unknown().optional(),
      currentPeriod: z
        .object({ type: z.string().optional(), end: z.string().optional() })
        .optional(),
    })
    .optional(),
});
const PrepaidBalanceSchema = z.object({
  val: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^\d+(?:\.\d+)?$/)
        .transform(Number),
    ])
    .pipe(z.number().finite().nonnegative()),
});
const CUSTOM_ENV = [
  'GROK_OIDC_ISSUER',
  'GROK_OIDC_CLIENT_ID',
  'GROK_OAUTH2_ISSUER',
  'GROK_OAUTH2_CLIENT_ID',
  'GROK_OAUTH2_PRINCIPAL_TYPE',
  'GROK_OAUTH2_PRINCIPAL_ID',
  'GROK_AUTH_PROVIDER_COMMAND',
  'GROK_LOCAL_AUTH',
  'GROK_CLI_CHAT_PROXY_BASE_URL',
  'GROK_MODELS_BASE_URL',
  'GROK_CONFIG',
  'GROK_CONFIG_PATH',
];

export function createGrokAccountPlanUsageReader(
  now: () => number = Date.now,
  fetcher: typeof fetch = fetch,
  readAuth: typeof readFile = readFile,
  env: NodeJS.ProcessEnv = process.env,
  logger?: Pick<Logger, 'debug'>,
): PlanUsageReader {
  const reject = (
    status: PlanUsageReading['status'],
    reason:
      | NonNullable<PlanUsageReading['statusReason']>
      | 'owner-not-applicable'
      | 'custom-auth-config',
  ): PlanUsageReading => {
    const statusReason =
      reason === 'owner-not-applicable' || reason === 'custom-auth-config'
        ? undefined
        : reason;
    logger?.debug('[GrokPlanUsage] direct reader rejected', { status, reason });
    return {
      status,
      ...(statusReason !== undefined && { statusReason }),
      windowSetEstablished: false,
      windows: [],
    };
  };
  return async ({ signal, target }) => {
    if (signal?.aborted) return reject('service-unavailable', 'cli-timeout');
    if (target.ownerRef.identityKind !== 'cli-store')
      return reject('no-usage-source', 'owner-not-applicable');
    if (env['XAI_API_KEY']?.trim())
      return reject('no-usage-source', 'api-key-no-subscription-quota');
    if (CUSTOM_ENV.some((name) => env[name]?.trim()))
      return reject('no-usage-source', 'custom-auth-config');
    const home =
      env['GROK_HOME']?.trim() ||
      join(env['HOME'] || env['USERPROFILE'] || homedir(), '.grok');
    try {
      for (const path of [
        join(home, 'config.toml'),
        join(home, 'managed_config.toml'),
        join(home, 'requirements.toml'),
        ...(process.platform === 'win32'
          ? []
          : ['/etc/grok/managed_config.toml', '/etc/grok/requirements.toml']),
      ]) {
        let config = '';
        try {
          config = await readAuth(path, 'utf8');
        } catch (error: unknown) {
          if (
            !(error instanceof Error) ||
            !('code' in error) ||
            error.code !== 'ENOENT'
          )
            return reject('service-unavailable', 'cli-unavailable');
        }
        if (
          /^\s*(?:\[\[?\s*)?["']?(?:auth|grok_com_config|endpoints)["']?\s*[.\]=]/m.test(
            config,
          )
        )
          return reject('no-usage-source', 'custom-auth-config');
      }
      let contents = env['GROK_AUTH']?.trim();
      if (!contents) {
        try {
          contents = await readAuth(join(home, 'auth.json'), 'utf8');
        } catch (error: unknown) {
          if (
            !(error instanceof Error) ||
            !('code' in error) ||
            error.code !== 'ENOENT'
          )
            return reject('service-unavailable', 'cli-unavailable');
          contents = '{}';
        }
      }
      const credentials = CredentialSchema.safeParse(JSON.parse(contents));
      if (!credentials.success)
        return reject('service-unavailable', 'cli-parse-failed');
      const credential =
        credentials.data[
          'https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828'
        ] ?? credentials.data['https://accounts.x.ai/sign-in'];
      const key =
        credential?.auth_mode === 'api_key'
          ? undefined
          : credential?.key?.trim();
      if (!key) {
        return reject(
          'no-usage-source',
          credential?.auth_mode === 'api_key'
            ? 'api-key-no-subscription-quota'
            : 'cli-not-signed-in',
        );
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const requestedAt = now();
        const response = await fetcher(GROK_BILLING_URL, {
          headers: { Authorization: `Bearer ${key}` },
          redirect: 'error',
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403)
          return reject(
            response.status === 401 ? 'unsupported-auth' : 'no-usage-source',
            'balance-auth-rejected',
          );
        if (response.status === 402)
          return reject('service-unavailable', 'balance-unavailable');
        if (!response.ok)
          return reject('service-unavailable', 'cli-unavailable');
        let payload: unknown;
        try {
          payload = await response.json();
        } catch (error: unknown) {
          if (!(error instanceof SyntaxError || (types.isNativeError(error) && error.name === 'SyntaxError')) || controller.signal.aborted) throw error;
          return reject('service-unavailable', 'balance-unavailable');
        }
        const parsed = BillingSchema.safeParse(payload);
        if (!parsed.success)
          return reject('service-unavailable', 'balance-unavailable');
        const observedAt = now();
        const percent = parsed.data.config?.creditUsagePercent;
        const rawBalance = parsed.data.config?.prepaidBalance;
        const parsedBalance =
          rawBalance == null
            ? undefined
            : PrepaidBalanceSchema.safeParse(rawBalance);
        const balance = parsedBalance?.success
          ? parsedBalance.data.val
          : undefined;
        const malformedBalance =
          parsedBalance !== undefined && !parsedBalance.success;
        const period = parsed.data.config?.currentPeriod;
        const type = period?.type?.replace(/^USAGE_PERIOD_TYPE_/, '');
        const kind =
          type === 'WEEKLY'
            ? 'weekly'
            : type === 'MONTHLY'
              ? 'monthly'
              : 'other';
        const resetsAt = Date.parse(period?.end ?? '');
        const windows: PlanLimitWindow[] =
          percent === undefined ||
          (percent >= 100 &&
            (malformedBalance || (balance !== undefined && balance > 0)))
            ? []
            : [
                {
                  key: 'other:subscription',
                  kind,
                  label:
                    kind === 'weekly'
                      ? 'Weekly'
                      : kind === 'monthly'
                        ? 'Monthly'
                        : 'Subscription',
                  used: {
                    kind: 'percent',
                    percent: Math.max(0, Math.min(100, percent)),
                  },
                  usedSource: 'provider-api',
                  usedObservedAt: observedAt,
                  ...(Number.isFinite(resetsAt) && {
                    resetsAt,
                    resetSource: 'provider-api' as const,
                  }),
                  observedAt,
                },
              ];
        return {
          status: 'available',
          source: 'provider-api',
          fetchedAt: observedAt,
          requestedAt,
          windowSetEstablished: !(
            malformedBalance &&
            percent !== undefined &&
            percent >= 100
          ),
          windows,
          ...(malformedBalance && {
            statusReason: 'prepaid-balance-unavailable' as const,
          }),
          ...(balance !== undefined && {
            credits: {
              balance: String(balance),
              hasCredits: balance > 0,
              unlimited: false,
            },
          }),
        };
      } catch (error: unknown) {
        return reject(
          'service-unavailable',
          controller.signal.aborted ||
            (error instanceof Error && error.name === 'TimeoutError')
            ? 'cli-timeout'
            : 'cli-unavailable',
        );
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
      }
    } catch (error: unknown) {
      return reject(
        'service-unavailable',
        error instanceof SyntaxError ? 'cli-parse-failed' : 'cli-unavailable',
      );
    }
  };
}
