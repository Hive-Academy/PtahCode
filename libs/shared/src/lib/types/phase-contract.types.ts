export const PHASE_CONTRACT_VERSION = 1 as const;

export const PHASE_KINDS = [
  'plan',
  'architecture',
  'implement',
  'review',
  'document-review',
  'research',
  'tests',
  'docs',
  'visual-review',
  'design',
  'batch',
  'completion',
] as const;

export type PhaseKind = (typeof PHASE_KINDS)[number];

export interface PhaseDefinitionV1 {
  readonly version: 1;
  readonly kind: PhaseKind;
  readonly input: readonly string[];
  readonly deliverable: readonly string[];
  readonly verdict: readonly string[];
  readonly acceptanceStep: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly toolProfile: {
    readonly disallowedTools: readonly string[];
    readonly permission: 'allow' | 'deny' | 'prompt';
  };
  readonly discipline: {
    readonly method: string;
    readonly outputContract: string;
    readonly returnValue: string;
    readonly refusals: string;
    readonly escalationProtocol: string;
    readonly reviewerStance?: string;
  };
}
