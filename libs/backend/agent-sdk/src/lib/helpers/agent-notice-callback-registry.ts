/**
 * AgentNoticeCallbackRegistry — fan-out for Ptah notices about a live SDK session that have no
 * other path to the host UI (TASK_2026_2310): a subagent ask or pause, and an overdue watchdog.
 *
 * Shaped like the other SDK callback registries: `register()` returns a disposer and
 * `notifyAll` dispatches synchronously, with a per-subscriber try/catch in
 * {@link CallbackRegistryBase}. A notice only informs. No subscriber can stop or abort a session
 * through this registry (pause, never kill).
 */
import { injectable, inject } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import type { AgentNoticeEvent } from '@ptah-extension/shared';
import { CallbackRegistryBase } from './callback-registry.base';

@injectable()
export class AgentNoticeCallbackRegistry extends CallbackRegistryBase<AgentNoticeEvent> {
  constructor(@inject(TOKENS.LOGGER) logger: Logger) {
    super(logger, 'AgentNoticeCallbackRegistry');
  }
}
