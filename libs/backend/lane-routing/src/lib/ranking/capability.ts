/** Machine capabilities used by the routing gate. */
export { MACHINE_CAPABILITIES } from '@ptah-extension/shared';
import type { MachineCapability } from '@ptah-extension/shared';
export type { MachineCapability } from '@ptah-extension/shared';

/** Derive capabilities from names that the candidate can actually call. */
export function capabilitiesFromTools(
  names: readonly string[],
): ReadonlySet<MachineCapability> {
  const capabilities = new Set<MachineCapability>();
  if (names.some((name) => name.startsWith('ptah_browser_'))) {
    capabilities.add('browser');
  }
  return capabilities;
}
