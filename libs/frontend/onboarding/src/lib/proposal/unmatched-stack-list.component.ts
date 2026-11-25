import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { SkillJudgeItem, StackSummaryItem } from '@ptah-extension/shared';
import { PtahBadgeDirective, PtahButtonDirective } from '@ptah-extension/ui';

/** One row of the list: an unmatched item (unjudged) or a judged item without an Install verdict. */
export interface UnmatchedRow {
  /** Stable judge item id; `null` for unjudged rows. */
  itemId: string | null;
  item: StackSummaryItem;
  status: 'build' | 'no-skill' | 'not-judged' | null;
  /** Reasons of the Build or No-skill outcomes, in outcome order. */
  reasons: string[];
  searchFailed: boolean;
}

export interface ManualDraftRequest {
  itemId: string | null;
  item: StackSummaryItem;
  opener: HTMLButtonElement;
}

/**
 * Items the registry did not match. In judged mode (`judgedItems` set) it lists
 * every judged item that has no Install verdict (Build, No-skill or no verdict),
 * with the judge reasons. Every row offers "Write a skill by hand" as an output;
 * a draft form is never rendered here (D5).
 */
@Component({
  selector: 'ptah-unmatched-stack-list',
  standalone: true,
  imports: [PtahBadgeDirective, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unmatched-stack-list.component.html',
})
export class UnmatchedStackListComponent {
  public readonly items = input<StackSummaryItem[]>([]);
  /** Judge items of the run; `null` keeps the unjudged behavior. */
  public readonly judgedItems = input<readonly SkillJudgeItem[] | null>(null);
  public readonly searching = input(false);
  /** Disables the manual draft openers, with the reason shown to the user. */
  public readonly draftBlockedReason = input<string | null>(null);
  public readonly searchRequested = output<string>();
  public readonly manualDraftRequested = output<ManualDraftRequest>();

  protected readonly rows = computed<UnmatchedRow[]>(() => {
    const judged = this.judgedItems();
    if (judged === null) {
      return this.items().map((item) => ({
        itemId: null,
        item,
        status: null,
        reasons: [],
        searchFailed: false,
      }));
    }
    return judged
      .filter((entry) => !entry.outcomes.some((o) => o.verdict === 'install'))
      .map((entry) => {
        const build = entry.outcomes.filter((o) => o.verdict === 'build');
        const rest = build.length
          ? build
          : entry.outcomes.filter((o) => o.verdict === 'no-skill');
        return {
          itemId: entry.itemId,
          item: entry.item,
          status: build.length
            ? 'build'
            : rest.length
              ? 'no-skill'
              : 'not-judged',
          reasons: rest.map((o) => o.reason),
          searchFailed: entry.registry === 'search-failed',
        };
      });
  });

  protected requestManualDraft(
    row: UnmatchedRow,
    opener: HTMLButtonElement,
  ): void {
    if (this.draftBlockedReason()) return;
    this.manualDraftRequested.emit({
      itemId: row.itemId,
      item: row.item,
      opener,
    });
  }
}
