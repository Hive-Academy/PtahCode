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

/** Host-resolved skill content. A channel may deliver its path or its text. */
export interface PhaseSkillV1 {
  readonly name: string;
  readonly path?: string;
  readonly text?: string;
}

/**
 * Whether an executor applied the phase tool profile to its own built-in
 * tools. `unfiltered` means that executor has no built-in deny channel.
 */
export interface ToolProfileAdapterResultV1 {
  readonly executorId: string;
  readonly toolProfileStatus: 'filtered' | 'unfiltered';
}

/** Versioned handoff from phase resolution to an executor. */
export interface PhaseDispatchV1 {
  readonly version: typeof PHASE_CONTRACT_VERSION;
  readonly kind: PhaseKind;
  readonly text: string;
  readonly definition: PhaseDefinitionV1;
  readonly toolProfile: PhaseDefinitionV1['toolProfile'];
  readonly skills?: readonly PhaseSkillV1[];
}
