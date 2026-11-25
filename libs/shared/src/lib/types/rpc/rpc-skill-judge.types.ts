import type { SkillShEntry } from './rpc-agents.types';
import type { StackSummaryItem } from './rpc-setup.types';

export interface ModelPair {
  provider: string;
  model: string;
}

export type SetupPairState =
  | { kind: 'unset'; effective: ModelPair }
  | { kind: 'set'; pair: ModelPair }
  | {
      kind: 'invalid';
      source: 'setup' | 'workspace';
      provider: string | null;
      model: string | null;
      cause:
        | 'provider-unknown'
        | 'provider-unsupported'
        | 'provider-missing'
        | 'model-missing'
        | 'model-stale'
        | 'not-signed-in';
    }
  | {
      kind: 'unavailable';
      source: 'setup' | 'workspace';
      provider: string;
      model: string;
      cause: 'provider-unavailable';
    };

export type SkillJudgeStageCategory =
  | 'not-configured'
  | 'unavailable'
  | 'unreachable'
  | 'auth'
  | 'queue-timed-out'
  | 'pre-dispatch-error'
  | 'timed-out'
  | 'invalid-output'
  | 'provider-error'
  | 'no-work';

export interface SkillJudgeStageRecord {
  stage: 'decision' | 'normal';
  status: 'used' | 'failed' | 'skipped';
  category?: SkillJudgeStageCategory;
  pairConfigured?: ModelPair;
  /** The effective pair at actual provider submission. */
  pairAttempted?: ModelPair;
  /** Present only when the stage status is `used`. */
  pairUsed?: ModelPair;
  itemsJudged: number;
  invalidItemIds: string[];
}

export type SkillJudgeOutcome =
  | {
      verdict: 'install';
      candidateId: string;
      reason: string;
      stage: 'decision' | 'normal';
    }
  | {
      verdict: 'build';
      proposalId: string;
      reason: string;
      stage: 'decision' | 'normal';
    }
  | {
      verdict: 'no-skill';
      reason: string;
      stage: 'decision' | 'normal';
    };

export interface SkillJudgeItem {
  itemId: string;
  item: StackSummaryItem;
  registry: 'matched' | 'no-match' | 'search-failed' | 'not-searched';
  registryFailure?: {
    kind: 'registry-error' | 'timed-out' | 'budget-exceeded';
    reason: string;
  };
  candidateIds: string[];
  candidateAssessments: {
    candidateId: string;
    eligible: boolean;
    rejection?: { reason: string; stage: 'decision' | 'normal' };
  }[];
  outcomes: SkillJudgeOutcome[];
  judgedBy: 'decision' | 'normal' | 'none';
}

export interface SkillJudgeCandidate {
  candidateId: string;
  selectionKey: string;
  skill: SkillShEntry;
  deprecated: boolean;
}

export interface SkillBuildProposal {
  proposalId: string;
  proposalRef?: string;
  name: string;
  description: string;
  itemIds: string[];
}

export interface SkillJudgeResult {
  method: 'decision' | 'normal' | 'mixed' | 'none';
  counts: { decision: number; normal: number; notJudged: number };
  items: SkillJudgeItem[];
  candidates: SkillJudgeCandidate[];
  proposals: SkillBuildProposal[];
  stages: SkillJudgeStageRecord[];
}

export type WizardGetSetupModelParams = Record<string, never>;

export interface WizardGetSetupModelResult {
  state: SetupPairState;
  /** Stored selector and model for Undo, when supplied by the host. */
  committed?: ModelPair;
}

export interface WizardSetSetupModelParams {
  provider: string;
  model: string;
}

export interface WizardSetSetupModelResult {
  /** The pair committed by this transaction, or null when cleared. */
  committed: ModelPair | null;
  state: SetupPairState;
  commitSeq: number;
}

export interface WizardGenerateSkillDraftParams {
  runId: string;
  proposalId: string;
  proposalName: string;
  items: {
    itemId: string;
    name: string;
    kind: string;
    evidence: string;
    buildReasons: string[];
  }[];
}

export type WizardGenerateSkillDraftResult =
  | {
      ok: true;
      name: string;
      description: string;
      body: string;
      content: string;
      destinationSlug: string;
      pairUsed: ModelPair;
    }
  | {
      ok: false;
      category:
        | 'no-model'
        | 'empty-output'
        | 'timed-out'
        | 'provider-error'
        | 'invalid-output'
        | 'invalid-pair';
      message: string;
    };
