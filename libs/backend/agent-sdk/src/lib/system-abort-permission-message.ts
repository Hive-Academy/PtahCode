/**
 * Deny window for UNROUTABLE permission requests only — those with no valid
 * UUID session/tab surface to render the prompt (the broadcast-fallback case,
 * e.g. gateway `gw-<id>` tabs). Routable webview requests keep an infinite wait
 * so a user can legitimately take minutes to answer. See F2 in TASK_2026_155.
 */
export const UNROUTABLE_PERMISSION_TIMEOUT_MS = 60_000;

import {
  formatPermissionExpired,
  formatPermissionTeardown,
} from '@ptah-extension/shared';

/**
 * Who resolved a pending permission request. Absent means a person answered it
 * in the UI. The host sets one of these when Ptah closed the request itself.
 */
export type PermissionDecisionOrigin =
  | 'host-timeout'
  | 'host-teardown'
  | 'host-disposal'
  | 'host-delivery-failed';

/**
 * Model-facing text for a denial Ptah manufactured. Callers send it with
 * `interrupt: false` so the CLI does not replace it with a canned refusal that
 * tells the model to stop and wait. Nobody decided anything (TASK_2026_247).
 */
export function buildSystemAbortPermissionMessage(
  toolName: string,
  internalReason: string,
): string {
  return `Ptah host closed the permission request for tool "${toolName}" because the session was being torn down (for example an authentication or configuration change) or the prompt could not be routed to any UI surface before its deadline. No decision was made on this request. The operation may be retried once the session is available again. Internal reason: "${internalReason}".`;
}

export function formatHostPermissionDenial(tool: string, reason: string, guidance: string): string {
  return `Ptah host denied ${tool} because ${reason}. ${guidance}`;
}

/** Model-facing text for a permission request that the host resolved by itself. */
export function buildHostPermissionDenyMessage(
  toolName: string,
  origin: PermissionDecisionOrigin,
): string {
  switch (origin) {
    case 'host-delivery-failed':
      return formatHostPermissionDenial(
        toolName, 'its permission request could not be delivered to the UI', 'Review the session state before retrying.',
      );
    case 'host-timeout':
      return formatPermissionExpired(toolName);
    case 'host-teardown':
      return formatPermissionTeardown(toolName, {
        actor: 'ptah-host',
        action: 'ended',
        reason: 'permission-cancelled',
        nextStep: 'review-permission',
      });
    case 'host-disposal':
      return formatPermissionTeardown(toolName, {
        actor: 'ptah-host',
        action: 'ended',
        reason: 'host-shutdown',
        nextStep: 'review-permission',
      });
  }
}
