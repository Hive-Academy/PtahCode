/** Machine capabilities used by the routing gate. */
export const MACHINE_CAPABILITIES = ['browser'] as const;
export type MachineCapability = (typeof MACHINE_CAPABILITIES)[number];

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

export function requiredCapabilities(
  phaseKind: string,
  explicit?: readonly MachineCapability[],
): readonly MachineCapability[] {
  if (explicit !== undefined) return explicit;
  return phaseKind === 'visual-review' || phaseKind === 'design'
    ? ['browser']
    : [];
}
