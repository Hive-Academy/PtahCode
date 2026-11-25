import type {
  ModelPair,
  SkillJudgeItem,
  SkillJudgeOutcome,
  SkillJudgeStageCategory,
} from '@ptah-extension/shared';

/** The label is the stable candidate ID within the item. */
export interface SkillRankingCandidate {
  readonly label: string;
  readonly name: string;
  readonly source?: string;
  readonly skillId?: string;
  readonly installs?: number;
  readonly description?: string;
  readonly deprecated?: boolean;
}

/** Keys must be unique within a request; candidates arrive in fallback order. */
export interface SkillRankingCallerItem {
  readonly key: string;
  readonly kind: string;
  readonly name: string;
  readonly evidence?: string;
  readonly registry?: SkillJudgeItem['registry'];
  readonly candidates: readonly SkillRankingCandidate[];
}

interface SkillRankingInstall extends Extract<
  SkillJudgeOutcome,
  { verdict: 'install' }
> {
  readonly stage: 'decision';
  readonly order: string[];
  readonly rejections: Readonly<Record<string, string>>;
}

interface SkillRankingAnswers {
  /** Original item keys. Items without an Install verdict need fallback. */
  readonly items: Readonly<Record<string, SkillRankingInstall>>;
  readonly itemRejections: Readonly<Record<string, string>>;
}

export type SkillRankingCallerResult = SkillRankingAnswers &
  (
    | {
        readonly status: 'used';
        readonly pairConfigured: ModelPair;
        readonly pairAttempted: ModelPair;
        readonly pairUsed: ModelPair;
      }
    | {
        readonly status: 'skipped';
        readonly category: Extract<
          SkillJudgeStageCategory,
          'not-configured' | 'no-work'
        >;
        readonly pairConfigured?: ModelPair;
      }
    | {
        readonly status: 'failed';
        readonly category: Extract<
          SkillJudgeStageCategory,
          | 'unreachable'
          | 'auth'
          | 'provider-error'
          | 'pre-dispatch-error'
          | 'timed-out'
          | 'invalid-output'
        >;
        readonly pairConfigured?: ModelPair;
        readonly pairAttempted?: ModelPair;
      }
  );

/** Registry metadata is untrusted and must stay small and free of executable markup. */
export function skillRankingText(value: string, maxLength = 200): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:[^\s]*/gi, '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/(?:[A-Za-z]:[\\/]|(?:^|\s)\/)[^\s]+/g, '')
    .trim()
    .slice(0, maxLength);
}
