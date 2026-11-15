/** Read Claude subscription windows without opening an SDK session. A Keychain-only login has no credential file and returns no-oauth. */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { Logger } from '@ptah-extension/vscode-core';
import { claudeAccountOwnerKey } from '../provider-owner.resolver';
import { mapClaudePlanUsage, PlanUsageParseError } from './claude-plan-usage.reader';
import type { PlanUsageReader, PlanUsageReading } from './plan-usage-reader.types';

export const CLAUDE_OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const TIMEOUT_MS = 5_000;
const MAX_RETRY_AFTER_MS = 5 * 60_000;
const retryAfterMs = (value: string | null, now: number): number => {
  if (!value) return 60_000;
  const seconds = Number(value);
  const duration = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1_000
    : Date.parse(value) - now;
  return Number.isFinite(duration) ? Math.max(1_000, Math.min(MAX_RETRY_AFTER_MS, duration)) : 60_000;
};
const Credentials = z.object({
  claudeAiOauth: z.object({
    accessToken: z.string().min(1),
    expiresAt: z.number().finite(),
  }).optional(),
});
const Config = z.object({
  oauthAccount: z.object({
    emailAddress: z.string().min(1),
    organizationName: z.string().optional(),
  }).optional(),
});
const Window = z.object({
  utilization: z.number().finite().min(0).nullable().optional(),
  resets_at: z.string().datetime({ offset: true }).nullable().optional(),
});
const Limit = z.object({
  kind: z.string().optional(),
  percent: z.number().finite().min(0).optional(),
  resets_at: z.string().datetime({ offset: true }).optional(),
  scope: z.object({ model: z.object({
    id: z.string().nullable().optional(),
    display_name: z.string().optional(),
  }).optional() }).nullable().optional(),
});
const ResponseBody = z.object({
  five_hour: z.unknown().optional(),
  seven_day: z.unknown().optional(),
  seven_day_opus: z.unknown().optional(),
  seven_day_sonnet: z.unknown().optional(),
  seven_day_oauth_apps: z.unknown().optional(),
  limits: z.unknown().optional(),
});

const unavailable = (reason: NonNullable<PlanUsageReading['statusReason']>, status: PlanUsageReading['status'] = 'service-unavailable'): PlanUsageReading => ({
  status, statusReason: reason, windowSetEstablished: false, windows: [],
});

/** Dependencies are injectable so tests never touch a real credential file or endpoint. */
export function createClaudeOauthPlanUsageReader(
  logger: Logger,
  now: () => number = Date.now,
  fetcher: typeof fetch = fetch,
  read: (path: string, encoding: 'utf8') => Promise<string> = (path, encoding) => readFile(path, encoding),
  home: () => string = homedir,
  env: () => Readonly<Record<string, string | undefined>> = () => process.env,
): PlanUsageReader {
  return async ({ target, signal }) => {
    if (target.claudeRoute?.kind === 'named' || target.ownerRef.identityKind !== 'account')
      return unavailable('account-unverified', 'no-usage-source');
    let token: string;
    const configDir = env().CLAUDE_CONFIG_DIR?.trim();
    const credentialsPath = join(configDir || join(home(), '.claude'), '.credentials.json');
    const accountPath = join(configDir || home(), '.claude.json');
    try {
      const raw = await read(credentialsPath, 'utf8');
      const credentials = Credentials.safeParse(JSON.parse(raw));
      const oauth = credentials.success ? credentials.data.claudeAiOauth : undefined;
      if (!oauth?.accessToken) return unavailable('no-oauth', 'no-usage-source');
      if (oauth.expiresAt <= now()) return unavailable('no-oauth', 'no-usage-source');
      token = oauth.accessToken;
      // The endpoint has no account identity. Require the local Claude account
      // metadata to reconstruct exactly the same owner key as accountInfo().
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.name : 'invalid';
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
        logger.debug('[PlanUsage] Claude OAuth credentials absent');
      else logger.warn('[PlanUsage] Claude OAuth credentials unavailable', { reason });
      return unavailable('no-oauth', 'no-usage-source');
    }
    try {
      // This metadata must match the live SDK accountInfo owner key before HTTP.
      const config = Config.safeParse(JSON.parse(await read(accountPath, 'utf8')));
      const account = config.success ? config.data.oauthAccount : undefined;
      if (!account || claudeAccountOwnerKey({
        email: account.emailAddress,
        organization: account.organizationName ?? '',
      }) !== target.ownerRef.key) return unavailable('account-unverified');
    } catch (error: unknown) {
      logger.warn('[PlanUsage] Claude OAuth account metadata unavailable', { reason: error instanceof Error ? error.name : 'invalid' });
      return unavailable('account-unverified');
    }
    if (signal?.aborted) return unavailable('cli-timeout');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, TIMEOUT_MS);
    try {
      const response = await fetcher(CLAUDE_OAUTH_USAGE_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', Accept: 'application/json' },
        redirect: 'error', signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        return {
          ...unavailable(response.status === 401 || response.status === 403 ? 'usage-auth-rejected' : 'cli-unavailable'),
          ...(response.status === 429 && { retryAfterMs: retryAfterMs(response.headers.get('Retry-After'), now()) }),
        };
      }
      let body: unknown;
      try { body = await response.json(); } catch { return unavailable('cli-parse-failed'); }
      const parsed = ResponseBody.safeParse(body);
      if (!parsed.success) return unavailable('cli-parse-failed');
      const limits: Record<string, unknown> = {};
      let droppedWindow = false;
      for (const field of ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet', 'seven_day_oauth_apps'] as const) {
        const value = parsed.data[field];
        const window = Window.safeParse(value);
        if (window.success) limits[field] = { ...window.data, ...(window.data.utilization !== undefined && window.data.utilization !== null && { utilization: Math.min(100, window.data.utilization) }) };
        else if (value !== undefined && value !== null) droppedWindow = true;
      }
      const scoped: { display_name: string; utilization: number; resets_at?: string }[] = [];
      if (Array.isArray(parsed.data.limits)) for (const raw of parsed.data.limits) {
        const entry = Limit.safeParse(raw);
        if (!entry.success) { droppedWindow = true; continue; }
        if (entry.data.kind !== 'weekly_scoped') continue;
        const name = entry.data.scope?.model?.display_name ?? entry.data.scope?.model?.id;
        if (name && entry.data.percent !== undefined)
          scoped.push({ display_name: name, utilization: Math.min(100, entry.data.percent), ...(entry.data.resets_at && { resets_at: entry.data.resets_at }) });
      }
      limits['model_scoped'] = scoped;
      if (Object.keys(limits).length === 1 && scoped.length === 0) return unavailable('cli-parse-failed');
      try {
        return { ...mapClaudePlanUsage({ rate_limits_available: true, rate_limits: limits }, now(), logger), windowSetEstablished: !droppedWindow, source: 'provider-api' };
      } catch (error: unknown) {
        if (error instanceof PlanUsageParseError) return unavailable('cli-parse-failed');
        throw error;
      }
    } catch (error: unknown) {
      logger.warn('[PlanUsage] Claude OAuth usage request failed', { reason: error instanceof Error ? error.name : 'invalid' });
      return unavailable(controller.signal.aborted ? 'cli-timeout' : 'cli-unavailable');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}
