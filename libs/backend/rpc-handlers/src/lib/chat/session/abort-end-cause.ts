import type { ChatAbortSource, SessionEndCause } from '@ptah-extension/shared';

export function endCauseForAbortSource(
  source?: ChatAbortSource,
): SessionEndCause {
  switch (source) {
    case 'stop-button':
    case 'apps-stop':
    case 'command-center':
      return 'user-stop';
    case 'tab-close':
      return 'tab-close';
    case 'workspace-remove':
      return 'workspace-close';
    default:
      return 'internal-abort';
  }
}
