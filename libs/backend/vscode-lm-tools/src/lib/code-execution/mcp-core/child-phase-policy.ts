import type { McpCallerBinding } from '@ptah-extension/platform-core';
import { PhaseDispatchSchema } from '@ptah-extension/shared/schemas';
import { z } from 'zod';

const callerDenialsSchema = z.array(z.string().trim().min(1));

/** A child must inherit every denial carried by the caller's credential. */
export function childPhasePolicyRefusal(
  binding: McpCallerBinding | undefined,
  payload: unknown,
): string | undefined {
  if (binding?.phaseKind === undefined && binding?.disallowedTools === undefined) {
    return undefined;
  }
  const validatedDenials = callerDenialsSchema.safeParse(binding?.disallowedTools);
  if (!validatedDenials.success) {
    return 'PHASE_DENIALS_REQUIRED: caller phase binding is malformed';
  }
  const parentDenials = validatedDenials.data;
  if (parentDenials.length === 0) return undefined;
  const child = PhaseDispatchSchema.safeParse(payload);
  if (!child.success) return 'PHASE_DENIALS_REQUIRED: phase caller must supply a valid child phase';
  const childDenials = new Set(child.data.toolProfile.disallowedTools);
  const missing = parentDenials.filter(name => !childDenials.has(name));
  return missing.length > 0
    ? `PHASE_DENIALS_REQUIRED: child phase omits caller denials: ${missing.join(', ')}`
    : undefined;
}
