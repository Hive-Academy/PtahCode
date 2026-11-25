import { Injectable, computed, signal } from '@angular/core';
import type { ModelPair, SkillJudgeStageRecord } from '@ptah-extension/shared';

/** One provider/model badge of the run pill, derived from a recorded pair. */
export interface OnboardingRunBadge {
  key: string;
  label: string;
  pair: string;
  status: 'used' | 'failed';
}

/** The pair snapshots of one accepted run, recorded once by the running page. */
export interface OnboardingRunPairs {
  /** The immutable analysis pair of the run; `null` when the run has none. */
  analysisPair: ModelPair | null;
  /** The recorded stage records of the skills judging part of the run. */
  stages: readonly SkillJudgeStageRecord[];
}

function formatPair(pair: ModelPair): string {
  return `${pair.provider} / ${pair.model}`;
}

/** Copy a pair so a later caller mutation cannot alter what the pill shows. */
function copyPair(pair: ModelPair): ModelPair {
  return { provider: pair.provider, model: pair.model };
}

function copyStage(record: SkillJudgeStageRecord): SkillJudgeStageRecord {
  return {
    ...record,
    pairConfigured: record.pairConfigured ? copyPair(record.pairConfigured) : undefined,
    pairAttempted: record.pairAttempted ? copyPair(record.pairAttempted) : undefined,
    pairUsed: record.pairUsed ? copyPair(record.pairUsed) : undefined,
  };
}

/**
 * The read-only provider/model pill in the shell's top bar.
 *
 * A page shows it once its run is accepted (the provider and model are locked
 * from then on) and clears it when the run ends or the page is left. Nothing
 * is shown when no page has set it.
 *
 * A page with recorded pair snapshots (`recordRun`) gets one badge per
 * recorded pair: the analysis pair plus one badge per judging stage, where
 * the Decision and Normal stages collapse into one badge when both their
 * pairs and statuses match. A stage that returned shows its used pair; a
 * failed stage shows its attempted pair. A page without pairs keeps the plain
 * `show` label. The recorded snapshots are copies: a later Setup change or
 * caller mutation never rewrites them.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingRunPillService {
  private readonly _label = signal<string | null>(null);
  private readonly _pairs = signal<OnboardingRunPairs | null>(null);

  /** The pill text, e.g. "Claude · sonnet"; `null` hides the plain pill. */
  readonly label = this._label.asReadonly();

  /** The recorded-pair badges of the current run; empty hides them. */
  readonly badges = computed<ReadonlyArray<OnboardingRunBadge>>(() => {
    const pairs = this._pairs();
    if (!pairs) return [];
    const badges: OnboardingRunBadge[] = [];
    if (pairs.analysisPair) {
      badges.push({
        key: 'analysis',
        label: 'Analysis',
        pair: formatPair(pairs.analysisPair),
        status: 'used',
      });
    }
    badges.push(...this.stageBadges(pairs.stages));
    return this.deduplicateStages(badges);
  });

  show(label: string): void {
    this._pairs.set(null);
    this._label.set(label.trim() === '' ? null : label);
  }

  /** Record the pair snapshots of an accepted run; replaces any plain label. */
  recordRun(pairs: OnboardingRunPairs): void {
    this._label.set(null);
    this._pairs.set({
      analysisPair: pairs.analysisPair ? copyPair(pairs.analysisPair) : null,
      stages: pairs.stages.map(copyStage),
    });
  }

  clear(): void {
    this._label.set(null);
    this._pairs.set(null);
  }

  private stageBadges(
    stages: readonly SkillJudgeStageRecord[],
  ): OnboardingRunBadge[] {
    const badges: OnboardingRunBadge[] = [];
    for (const record of stages) {
      const label = record.stage === 'decision' ? 'Decision stage' : 'Normal stage';
      if (record.status === 'used' && record.pairUsed) {
        badges.push({
          key: record.stage,
          label,
          pair: formatPair(record.pairUsed),
          status: 'used',
        });
      } else if (record.status === 'failed' && record.pairAttempted) {
        badges.push({
          key: record.stage,
          label,
          pair: `attempted ${formatPair(record.pairAttempted)}`,
          status: 'failed',
        });
      }
      // `skipped` stages and stages without a recorded pair show no badge.
    }
    return badges;
  }

  /** Collapse the Decision and Normal badges into one when both their pairs and statuses match. */
  private deduplicateStages(badges: OnboardingRunBadge[]): OnboardingRunBadge[] {
    const decisionIndex = badges.findIndex((badge) => badge.key === 'decision');
    const normalIndex = badges.findIndex((badge) => badge.key === 'normal');
    if (decisionIndex === -1 || normalIndex === -1) return badges;
    const decision = badges[decisionIndex];
    const normal = badges[normalIndex];
    if (decision.pair !== normal.pair || decision.status !== normal.status) {
      return badges;
    }
    const merged: OnboardingRunBadge = {
      key: 'stages',
      label: 'Decision + Normal stage',
      pair: decision.pair,
      status: decision.status,
    };
    const first = Math.min(decisionIndex, normalIndex);
    const next = badges.filter((badge) => badge.key !== 'decision' && badge.key !== 'normal');
    next.splice(first, 0, merged);
    return next;
  }
}
