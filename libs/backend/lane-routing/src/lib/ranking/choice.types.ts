import type { ModelEffort } from '../contracts/route-decide-result.schema';
import type { ChoiceEvidence } from '../matrix/choice-evidence';

export interface ChoiceInput {
  readonly evidence: ChoiceEvidence;
  readonly policyEffort: ModelEffort;
  /** The rule sets effort or the phase is pinned. */
  readonly effortFixed: boolean;
  /** The caller allows exploration for this phase and rule match. */
  readonly exploreTurn: boolean;
}

export type EvidenceSource = 'pair' | 'model' | 'family' | 'prior';
