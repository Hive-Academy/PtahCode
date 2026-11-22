/**
 * Fixed copy for a model list that could not be loaded live.
 *
 * Every surface that explains a failed or persisted model list reads its text
 * from here, keyed by the closed `ModelListFailureReason` set. The text never
 * interpolates vendor or error text; only the provider's display name and the
 * saved list's date are inserted. Raw failure details belong in debug logs.
 */

import type { ModelListFailureReason } from '../types/rpc/rpc-providers.types';

/**
 * Reasons that mean the credential is missing or refused. A persisted list is
 * never shown for these: the saved list may belong to a different account.
 */
export const CREDENTIAL_FAILURE_REASONS: ReadonlySet<ModelListFailureReason> =
  new Set<ModelListFailureReason>(['no-key', 'not-signed-in', 'auth-rejected']);

/**
 * One fixed sentence fragment per reason, without a trailing full stop.
 *
 * @param reason - Why the live list could not be used
 * @param providerName - The provider's display name
 */
export function describeModelListFailure(
  reason: ModelListFailureReason,
  providerName: string,
): string {
  switch (reason) {
    case 'no-key':
      return `add your ${providerName} API key in Settings`;
    case 'not-signed-in':
      return `sign in to ${providerName} in Settings`;
    case 'auth-rejected':
      return `${providerName} rejected the API key; delete it and enter a valid one in Settings`;
    case 'timeout':
      return `${providerName} did not answer in time`;
    case 'network':
      return `couldn't reach ${providerName}`;
    case 'http-error':
      return `${providerName} returned an error`;
    case 'bad-response':
      return `${providerName} sent a model list Ptah can't read`;
    case 'empty':
      return `${providerName} returned no models`;
    case 'no-live-source':
      return `${providerName} has no model list endpoint`;
    case 'unexpected':
      return 'an unexpected error occurred (details in the log)';
    default: {
      const unhandled: never = reason;
      return unhandled;
    }
  }
}

/** The `error` text of an `'unavailable'` list. */
export function modelListErrorText(
  reason: ModelListFailureReason,
  providerName: string,
): string {
  return `Couldn't load models from ${providerName}: ${describeModelListFailure(reason, providerName)}.`;
}

/**
 * The `notice` text of a `'persisted'` list. The date is the UTC calendar
 * date of `savedAt`, so the text does not depend on the machine's locale or
 * time zone.
 *
 * @param savedAt - Epoch ms at which the saved list was fetched
 */
export function modelListNoticeText(
  reason: ModelListFailureReason,
  providerName: string,
  savedAt: number,
): string {
  const failure = `Couldn't load models from ${providerName} (${describeModelListFailure(reason, providerName)}).`;
  const date = new Date(savedAt);
  // An out-of-range or non-numeric savedAt is an invalid Date, whose
  // toISOString throws; the notice then omits the date instead.
  const saved = Number.isNaN(date.getTime())
    ? 'Showing the saved list.'
    : `Showing the list saved on ${date.toISOString().slice(0, 10)}.`;
  return `${failure} ${saved}`;
}
