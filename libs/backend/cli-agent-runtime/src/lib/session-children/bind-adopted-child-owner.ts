import type { SessionChildRegistry } from './session-child.registry';

/** Make both successor IDs usable by the existing ownership checks. */
export function bindAdoptedChildOwner(
  registry: SessionChildRegistry,
  tabId: string,
  sdkId: string,
): void {
  for (const child of registry.childrenOf([tabId])) {
    registry.reparent(child.childSessionId, tabId, sdkId);
  }
}
