import type { ResolvedSetupSnapshot } from '@ptah-extension/agent-sdk';
import type { SkillJudgeItem, SkillShEntry } from '@ptah-extension/shared';

export type SkillJudgeInputItem = Pick<
  SkillJudgeItem,
  'itemId' | 'item' | 'registry' | 'registryFailure'
> & {
  candidates: readonly SkillShEntry[];
};

export interface SkillJudgeRequest {
  workspaceRoot?: string;
  /** Original RPC entry time, before Setup resolution and registry search. */
  rpcEntry: number;
  /** Strict Setup resolution taken before registry search. */
  resolved: ResolvedSetupSnapshot;
  /** Original stack order, with stable item IDs assigned before coalescing searches. */
  items: readonly SkillJudgeInputItem[];
}
