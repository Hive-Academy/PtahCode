/**
 * User-facing text for a plan-limit status reason. Shared by the dashboard
 * account cards and the chat sidebar plan tiles, so both name the same cause
 * in the same words. Pure data; the backend extends only the reason union,
 * never this text.
 */
import type {
  PlanLimitStatusReason,
  PlanLimitUnavailableReason,
} from '../../types/plan-limit.types';

/**
 * Plain action text for one typed status reason. One entry for every
 * `PlanLimitStatusReason`, so a new reason fails to compile here until it
 * gets its sentence. Several readers (Antigravity, Grok, Claude, Codex) send
 * the same reasons, so this map names no provider; a provider's own wording
 * lives in `PROVIDER_REASON_LABELS`.
 */
export const PLAN_LIMIT_REASON_LABELS: Readonly<
  Record<PlanLimitStatusReason, string>
> = {
  'no-oauth': 'Not signed in (OAuth)',
  'no-local-server': 'Provider app is not running',
  'cli-unavailable': 'Provider usage unavailable',
  'cli-not-found': 'Provider CLI not found',
  'cli-timeout': 'Usage read did not respond in time',
  'cli-not-signed-in': 'Sign in to the provider CLI',
  'cli-exit-error': 'Provider CLI exited with an error',
  'cli-parse-failed': 'Provider usage output not recognized',
  'cli-backoff': 'Usage read paused after a failure',
  'usage-budget-exhausted': 'Usage read did not finish in time',
  'account-unverified':
    'Usage account could not be matched to this account',
  'api-key-no-subscription-quota':
    'No subscription quota for API-key login; local usage only',
  'balance-unavailable':
    'Plan limits unavailable right now; showing request counts',
  'prepaid-balance-unavailable': 'Prepaid balance unavailable right now',
  'balance-auth-rejected':
    'API key cannot read plan limits; showing request counts',
  'usage-auth-rejected': 'API key cannot read request counts',
  'no-usage-windows': 'No usage windows reported',
};

/**
 * Provider wording that replaces a neutral label above, keyed by plan-owner
 * provider id. Only text that names the provider or its CLI command lives
 * here.
 */
export const PROVIDER_REASON_LABELS: Readonly<
  Record<string, Readonly<Partial<Record<PlanLimitStatusReason, string>>>>
> = {
  antigravity: {
    // A missing `acp_token.json` is not a sign-out: plain `agy acp` keeps its
    // sign-in in the OS keyring and never writes that file. A sign-out is
    // reported as `cli-not-signed-in` by the agy sign-in check.
    'no-oauth': 'Antigravity quota token file not found',
    'no-local-server': 'Antigravity app is not running',
    'cli-unavailable': 'Antigravity CLI usage unavailable',
    'cli-not-found': 'Antigravity CLI (agy) not found',
    'cli-timeout': 'Antigravity CLI did not respond in time',
    'cli-not-signed-in': 'Sign in to the Antigravity CLI (run agy once)',
    'cli-exit-error': 'Antigravity CLI exited with an error',
    'cli-parse-failed': 'Antigravity CLI usage output not recognized',
    'cli-backoff': 'Antigravity CLI usage read paused after a failure',
    'account-unverified':
      'Antigravity CLI account could not be matched to this account',
  },
  grok: {
    'cli-unavailable': 'Grok CLI usage unavailable',
    'cli-timeout': 'Grok CLI did not respond in time',
    'cli-not-signed-in': 'Sign in to the Grok CLI (run grok login)',
    'cli-parse-failed': 'Grok CLI usage output not recognized',
  },
};

/** The one route-level unavailable reason: no session to read from. */
export const NO_OPEN_SESSION_LABEL =
  'No open session to read this account’s usage from.';

/**
 * The label for a typed reason, or `null` when the reason is not known.
 * Covers `PlanLimitStatusReason` and `PlanLimitUnavailableReason`; a runtime
 * value the map does not know falls back to `null`, never to a fabricated
 * sentence. `providerId` (the plan owner's) picks the provider's own wording
 * when it has one; every other provider gets the neutral label.
 */
export function planLimitReasonLabel(
  reason: PlanLimitStatusReason | PlanLimitUnavailableReason | undefined,
  providerId: string,
): string | null {
  if (reason === undefined) return null;
  if (reason === 'no-open-session') return NO_OPEN_SESSION_LABEL;
  if (!Object.hasOwn(PLAN_LIMIT_REASON_LABELS, reason)) return null;
  const own = Object.hasOwn(PROVIDER_REASON_LABELS, providerId)
    ? PROVIDER_REASON_LABELS[providerId][reason]
    : undefined;
  return own ?? PLAN_LIMIT_REASON_LABELS[reason];
}
