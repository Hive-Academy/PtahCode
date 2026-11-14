import { phaseKindForRole } from '@ptah-extension/shared';
import type {
  OutcomeTaskKind,
  OutcomeTaskKindSource,
  PhaseKind,
} from '@ptah-extension/shared';

/**
 * Task kinds and phase kinds mapped to the task kind they perform
 * (Req 2, `taskKindSource: 'mapped'`). Keys are lower case; lookup is a
 * case-insensitive exact match with no fuzzy matching. Phase kinds mirror
 * `lane-routing` `phase-plan.ts` (`taskKindFor`). Legacy agent slugs are not
 * listed here: `taskKindForRole` resolves them through the shared alias table
 * (`phaseKindForRole`) and `TASK_KIND_BY_PHASE`.
 */
const TASK_KIND_BY_ROLE: ReadonlyMap<string, OutcomeTaskKind> = new Map<
  string,
  OutcomeTaskKind
>([
  // Task kinds and phase kinds.
  ['plan', 'plan'],
  ['architecture', 'plan'],
  ['batch', 'plan'],
  ['completion', 'plan'],
  ['implement', 'implement'],
  ['review', 'review'],
  ['document-review', 'review'],
  ['visual-review', 'review'],
  ['plan-review', 'review'],
  ['research', 'research'],
  ['tests', 'tests'],
  ['docs', 'docs'],
  ['design', 'docs'],
]);

const TASK_KIND_BY_PHASE: Readonly<Record<PhaseKind, OutcomeTaskKind>> = {
  plan: 'plan', architecture: 'plan', batch: 'plan', completion: 'plan',
  implement: 'implement', review: 'review', 'document-review': 'review',
  'visual-review': 'review', research: 'research',
  tests: 'tests', docs: 'docs', design: 'docs',
};

/**
 * The task kind a known role or subagent type performs, or null when the role
 * is absent or unknown (including `general-purpose`, `Explore` and `unknown`).
 */
export function taskKindForRole(role: string | null): OutcomeTaskKind | null {
  if (role === null) return null;
  const direct = TASK_KIND_BY_ROLE.get(role.trim().toLowerCase());
  if (direct) return direct;
  const phaseKind = phaseKindForRole(role);
  return phaseKind ? TASK_KIND_BY_PHASE[phaseKind] : null;
}

export interface ResolvedTaskKind {
  readonly taskKind: OutcomeTaskKind | null;
  readonly taskKindSource: OutcomeTaskKindSource;
}

/**
 * The row's task kind before any classification: explicit task kind, then
 * the phase kind, then the legacy role alias, then unclassified.
 * Classification happens after insert. A phase kind is also still readable
 * through {@link taskKindForRole} when a caller only has the old alias.
 */
export function resolveTaskKind(
  explicit: OutcomeTaskKind | null,
  phaseKind: PhaseKind | null,
  role: string | null,
): ResolvedTaskKind {
  if (explicit) return { taskKind: explicit, taskKindSource: 'explicit' };
  if (phaseKind) {
    return { taskKind: TASK_KIND_BY_PHASE[phaseKind], taskKindSource: 'mapped' };
  }
  const mapped = taskKindForRole(role);
  if (mapped) return { taskKind: mapped, taskKindSource: 'mapped' };
  return { taskKind: null, taskKindSource: 'unclassified' };
}
