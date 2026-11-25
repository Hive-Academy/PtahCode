import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { SkillJudgeItem } from '@ptah-extension/shared';
import { PtahBadgeDirective, PtahButtonDirective } from '@ptah-extension/ui';

/**
 * Row for a detected item the judge did not decide (no-judge and both-failed
 * states, plan row 571). The row discloses a failed registry search and offers
 * the per-item manual draft action (plan row 567) as an output.
 */
@Component({
  selector: 'ptah-skill-not-judged-row',
  standalone: true,
  imports: [PtahBadgeDirective, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="flex min-w-0 flex-wrap items-start gap-x-[var(--ptah-gap-controls)] gap-y-[var(--ptah-gap-label)] rounded-[var(--glass-radius-inner,var(--ptah-radius-surface))] border border-[var(--ptah-border-color)] bg-[var(--glass-fill-tile,var(--surface-1))] p-[var(--ptah-surface-pad)]"
    >
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 flex-wrap items-center gap-x-[var(--ptah-gap-label)] gap-y-[var(--ptah-gap-label)]">
          <strong class="min-w-0 truncate text-sm font-semibold text-base-content" [title]="item().item.name">{{
            item().item.name
          }}</strong>
          <span ptahBadge tone="warn" size="xs">Not judged</span>
          @if (searchFailed()) {
            <span ptahBadge tone="err" size="xs">Search failed</span>
          }
        </div>
        <span class="text-xs text-base-content-muted">{{ item().item.kind }}</span>
        @if (searchFailureText(); as searchFailureText) {
          <p class="mt-[var(--ptah-gap-label)] text-xs text-base-content-muted">
            {{ searchFailureText }}
          </p>
        }
      </div>
      <button
        type="button"
        ptahButton
        variant="ghost"
        size="xs"
        class="shrink-0"
        [attr.aria-label]="'Write a skill by hand for ' + item().item.name"
        (click)="manualDraftRequested.emit()"
      >
        Write a skill by hand
      </button>
    </div>
  `,
})
export class SkillNotJudgedRowComponent {
  public readonly item = input.required<SkillJudgeItem>();
  public readonly manualDraftRequested = output<void>();

  protected readonly searchFailed = computed(
    () => this.item().registry === 'search-failed',
  );

  /** Failed-search status of both-failed rows (plan row 571, TD 4.4). */
  protected readonly searchFailureText = computed<string | null>(() => {
    if (!this.searchFailed()) {
      return null;
    }
    const failure = this.item().registryFailure;
    return failure
      ? `Registry search failed (${failure.kind}): ${failure.reason}`
      : 'Registry search failed for this item.';
  });
}
