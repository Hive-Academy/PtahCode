import type { CodexContext } from './codex-runtime.types';

/** Keep a lane's scope alive until its context closes, then release it once. */
export function ownCodexContext(
  context: CodexContext,
  dispose: () => Promise<void>,
): CodexContext {
  let closing: Promise<void> | undefined;
  return {
    get identity() { return context.identity; },
    get turnPermissionLevel() { return context.turnPermissionLevel; },
    listModels: () => context.listModels(),
    events: (signal) => context.events(signal),
    startTurn: (input) => context.startTurn(input),
    steer: (input, expectedTurnId) => context.steer(input, expectedTurnId),
    interrupt: (turnId) => context.interrupt(turnId),
    updateNextTurn: (patch) => context.updateNextTurn(patch),
    compact: () => context.compact(),
    close: () => (closing ??= dispose()),
  };
}
