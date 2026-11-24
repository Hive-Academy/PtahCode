/**
 * Ask the bound MCP gateway to re-read its sources now (TASK_2026_979 B23).
 *
 * An install, an uninstall or a capability toggle changes what the gateway
 * serves. Without this the change reaches a running session only at the
 * gateway's next 30 s poll; with it, `onToolsChanged` fires at once and the
 * session re-lists its tools.
 *
 * The gateway is resolved on each call, not at construction: it is a cached
 * factory, and a host without auth secrets binds none (then this is a no-op).
 */

import type { DependencyContainer } from 'tsyringe';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import type { IMcpGateway } from '@ptah-extension/platform-core';

/** Refresh the bound gateway, if any. Never throws; never waits. */
export function refreshBoundMcpGateway(
  container: Pick<DependencyContainer, 'isRegistered' | 'resolve'>,
): void {
  if (!container.isRegistered(PLATFORM_TOKENS.MCP_GATEWAY, true)) return;
  // `refresh()` never rejects; it logs its own failure.
  void container.resolve<IMcpGateway>(PLATFORM_TOKENS.MCP_GATEWAY).refresh();
}
