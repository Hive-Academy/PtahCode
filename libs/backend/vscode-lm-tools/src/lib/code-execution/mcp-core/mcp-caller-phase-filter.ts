import type { McpCallerBinding } from '@ptah-extension/platform-core';

/**
 * Names the phase profile removes.
 *
 * Reads only the authenticated binding (the HTTP gate copies it from the
 * credential; a request body cannot set it). Blank and non-string entries
 * are dropped. Missing, non-array, or empty means this caller is unfiltered.
 */
export function phaseDisallowedTools(
  binding: McpCallerBinding | undefined,
): readonly string[] | undefined {
  const listed = binding?.disallowedTools;
  if (!Array.isArray(listed) || listed.length === 0) return undefined;
  const names = listed.filter(
    (name): name is string =>
      typeof name === 'string' && name.trim().length > 0,
  );
  return names.length === 0 ? undefined : names;
}

/** True when the phase profile bound to this credential hides `name`. */
export function isPhaseToolDenied(
  name: string,
  binding: McpCallerBinding | undefined,
): boolean {
  const denied = phaseDisallowedTools(binding);
  return denied !== undefined && denied.includes(name);
}

/**
 * Drop phase-denied tools. Relative order of the tools that remain matches
 * `tools`, so a profile with no denials stays byte-stable.
 */
export function applyPhaseToolFilter<T extends { readonly name: string }>(
  tools: readonly T[],
  binding: McpCallerBinding | undefined,
): T[] {
  const denied = phaseDisallowedTools(binding);
  if (denied === undefined) return tools.slice();
  const blocked = new Set(denied);
  return tools.filter((tool) => !blocked.has(tool.name));
}
