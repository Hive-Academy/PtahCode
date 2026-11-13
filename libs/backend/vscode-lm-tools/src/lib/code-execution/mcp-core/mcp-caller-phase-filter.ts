import type { McpCallerBinding } from '@ptah-extension/platform-core';
import { z } from 'zod';

const denialList = z.array(z.string().trim().min(1));

/**
 * Names the phase profile removes.
 *
 * Reads only the authenticated binding. A malformed list on a present phase
 * is handled as a denial by both list and call paths.
 */
export function phaseDisallowedTools(
  binding: McpCallerBinding | undefined,
): readonly string[] | undefined {
  if (binding?.phaseKind === undefined) return undefined;
  const parsed = denialList.safeParse(binding.disallowedTools);
  return parsed.success ? parsed.data : undefined;
}

function malformedPhase(binding: McpCallerBinding | undefined): boolean {
  return binding?.phaseKind !== undefined &&
    !denialList.safeParse(binding.disallowedTools).success;
}

/** True when the phase profile bound to this credential hides `name`. */
export function isPhaseToolDenied(
  name: string,
  binding: McpCallerBinding | undefined,
): boolean {
  if (malformedPhase(binding)) return name === 'execute_code' || name.startsWith('ptah_');
  const denied = phaseDisallowedTools(binding);
  return denied !== undefined && (denied.includes(name) ||
    (name === 'execute_code' && denied.some((tool) => tool.startsWith('ptah_'))));
}

/**
 * Drop phase-denied tools. Relative order of the tools that remain matches
 * `tools`, so a profile with no denials stays byte-stable.
 */
export function applyPhaseToolFilter<T extends { readonly name: string }>(
  tools: readonly T[],
  binding: McpCallerBinding | undefined,
): T[] {
  return tools.filter((tool) => !isPhaseToolDenied(tool.name, binding));
}
