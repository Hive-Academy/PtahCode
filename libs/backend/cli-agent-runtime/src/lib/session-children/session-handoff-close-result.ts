import type { HandoffCloseResult, SessionHandoffAckResult } from './session-handoff.port';

const reasons: Record<Exclude<HandoffCloseResult, { kind: 'closed' | 'absent' | 'timeout' | 'broadcast-failed' }>['code'], string> = {
  streaming: 'Predecessor turn is still streaming; retry after it ends.',
  resuming: 'Predecessor tab is resuming; retry after it settles.',
  switching: 'Predecessor tab is switching sessions; retry after it settles.',
  background: 'Predecessor tab still reports background work; retry after it settles.',
  sleeping: 'Predecessor tab is sleeping with background work; retry after it settles.',
  'other-status': 'Predecessor tab is not ready to close; retry after it settles.',
  'pending-background-tasks': 'Predecessor tab still reports background tasks; retry after they finish.',
  'unsent-input': 'Predecessor tab has unsent input; send or discard it, then close the tab manually.',
  'queued-message': 'Predecessor tab has a queued message; send or remove it, then close the tab manually.',
  'permission-prompt': 'Predecessor tab has an open permission prompt; resolve it, then close the tab manually.',
  'command-center': 'Predecessor is a Command Center tab; close it manually after reviewing its state.',
  'sdk-mismatch': 'Predecessor tab now belongs to another SDK session; inspect it and close it manually.',
  'close-rejected': 'Predecessor tab remained open after the close request; inspect it and close it manually.',
  'close-error': 'Predecessor tab close failed in the renderer; retry after the renderer recovers.',
  'invalid-request': 'Predecessor close request was invalid; inspect the host and close the tab manually.',
  unknown: 'Predecessor renderer refused to close the tab without a cause; inspect it and close it manually.',
};

const terminal = new Set(['unsent-input', 'queued-message', 'permission-prompt', 'command-center', 'sdk-mismatch', 'close-rejected', 'invalid-request', 'unknown']);

export function handoffCloseAckResult(result: HandoffCloseResult): SessionHandoffAckResult {
  switch (result.kind) {
    case 'closed': return { status: 'closed', reason: 'predecessor closed' };
    case 'absent': return { status: 'refused', reason: 'Predecessor tab was not found in any window; inspect the sessions list and close it manually if present.' };
    case 'timeout': return { status: 'retryable-failure', reason: 'No renderer answered the predecessor close request before the timeout; retry after the window responds.' };
    case 'broadcast-failed': return { status: 'retryable-failure', reason: 'Could not broadcast the predecessor close request; retry after the window reconnects.' };
    case 'blocked': return { status: terminal.has(result.code) ? 'refused' : 'retryable-failure', reason: reasons[result.code] };
  }
}
