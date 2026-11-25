import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import type {
  SkillJudgeResult,
  SkillJudgeStageCategory,
  SkillJudgeStageRecord,
} from '@ptah-extension/shared';
import { PtahBadgeDirective, PtahButtonDirective } from '@ptah-extension/ui';

let nextBannerDetailsId = 0;

/** Display labels for stage categories (design-spec section 8; hyphens become spaces). */
const STAGE_CATEGORY_LABELS: Record<SkillJudgeStageCategory, string> = {
  'not-configured': 'not configured',
  unavailable: 'unavailable',
  unreachable: 'unreachable',
  auth: 'auth',
  'queue-timed-out': 'queue timed out',
  'pre-dispatch-error': 'pre-dispatch error',
  'timed-out': 'timed out',
  'invalid-output': 'invalid output',
  'provider-error': 'provider error',
  'no-work': 'no work',
};

interface StageDetail {
  readonly label: string;
  readonly status: SkillJudgeStageRecord['status'];
  readonly statusTone: 'ok' | 'err' | 'neutral';
  readonly category: string | null;
  /** `used <pair>`, `attempted <pair>`, or `configured <pair>`; null when the record carries no pair. */
  readonly pairText: string | null;
  readonly itemsText: string | null;
}

/**
 * One-line judged-by summary of a skills run (R22, plan row 570).
 * Details collapse behind a disclosure button and read stage records only (R14/F26).
 */
@Component({
  selector: 'ptah-skill-method-banner',
  standalone: true,
  imports: [PtahBadgeDirective, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex min-w-0 flex-wrap items-center gap-x-[var(--ptah-gap-controls)] gap-y-[var(--ptah-gap-label)]">
      <p class="min-w-0 flex-1 text-sm text-base-content">{{ summary() }}</p>
      @if (stageDetails().length) {
        <button
          type="button"
          ptahButton
          variant="ghost"
          size="xs"
          [attr.aria-expanded]="detailsExpanded()"
          [attr.aria-controls]="detailsId"
          (click)="toggleDetails()"
        >
          {{ detailsExpanded() ? 'Hide details' : 'Details' }}
        </button>
      }
    </div>
    @if (stageDetails().length) {
      <ul
        [id]="detailsId"
        [hidden]="!detailsExpanded()"
        [class.flex]="detailsExpanded()"
        class="mt-[var(--ptah-gap-label)] list-none flex-col gap-[var(--ptah-gap-label)] p-0"
      >
        @for (stage of stageDetails(); track $index) {
          <li
            class="flex flex-wrap items-center gap-x-[var(--ptah-gap-controls)] gap-y-[var(--ptah-gap-label)] text-xs text-base-content-muted"
          >
            <span ptahBadge [tone]="stage.statusTone" size="xs">{{ stage.status }}</span>
            <span class="font-medium">{{ stage.label }}</span>
            @if (stage.category; as category) {
              <span>{{ category }}</span>
            }
            @if (stage.pairText; as pairText) {
              <span class="font-mono">{{ pairText }}</span>
            }
            @if (stage.itemsText; as itemsText) {
              <span>{{ itemsText }}</span>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class SkillMethodBannerComponent {
  public readonly method = input.required<SkillJudgeResult['method']>();
  public readonly counts = input.required<SkillJudgeResult['counts']>();
  public readonly stages = input<readonly SkillJudgeStageRecord[]>([]);

  protected readonly detailsExpanded = signal(false);
  protected readonly detailsId = `skill-method-banner-details-${nextBannerDetailsId++}`;

  protected readonly summary = computed<string>(() => {
    const { decision, normal, notJudged } = this.counts();
    const notJudgedText =
      notJudged > 0 ? `, ${notJudged} not judged` : '';
    switch (this.method()) {
      case 'decision':
        return `Judged by AI (decision model)${notJudgedText}`;
      case 'normal':
        return `Judged by AI (normal model)${notJudgedText}`;
      case 'mixed':
        return `Judged by AI — ${decision} by decision, ${normal} by normal${notJudgedText}`;
      case 'none':
        return notJudged > 0
          ? `AI review is unavailable — showing registry order (${notJudged} not judged)`
          : 'AI review is unavailable — showing registry order';
    }
  });

  protected readonly stageDetails = computed<readonly StageDetail[]>(() =>
    this.stages().map((stage) => {
      const pairText =
        stage.status === 'used'
          ? stage.pairUsed
            ? `used ${stage.pairUsed.provider} / ${stage.pairUsed.model}`
            : null
          : stage.pairAttempted
            ? `attempted ${stage.pairAttempted.provider} / ${stage.pairAttempted.model}`
            : stage.pairConfigured
              ? `configured ${stage.pairConfigured.provider} / ${stage.pairConfigured.model}`
              : null;
      return {
        label: stage.stage === 'decision' ? 'Decision stage' : 'Normal stage',
        status: stage.status,
        statusTone:
          stage.status === 'used'
            ? 'ok'
            : stage.status === 'failed'
              ? 'err'
              : 'neutral',
        category:
          stage.status !== 'used' && stage.category
            ? STAGE_CATEGORY_LABELS[stage.category]
            : null,
        pairText,
        itemsText:
          stage.itemsJudged === 1
            ? '1 item judged'
            : stage.itemsJudged > 0
              ? `${stage.itemsJudged} items judged`
              : null,
      };
    }),
  );

  protected toggleDetails(): void {
    this.detailsExpanded.set(!this.detailsExpanded());
  }
}
