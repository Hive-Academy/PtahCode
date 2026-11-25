import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  SkillBuildProposal,
  SkillJudgeItem,
  WizardGenerateSkillDraftParams,
} from '@ptah-extension/shared';
import { PtahBadgeDirective, PtahButtonDirective } from '@ptah-extension/ui';

let nextDetailsId = 0;

export interface SkillBuildPreviewRequest {
  params: WizardGenerateSkillDraftParams;
  opener: HTMLButtonElement;
}

@Component({
  selector: 'ptah-skill-build-row',
  standalone: true,
  imports: [PtahBadgeDirective, PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="min-w-0 space-y-2 rounded-[var(--ptah-radius-surface)] border
        border-[var(--ptah-border-color)] bg-[var(--glass-fill-tile,var(--surface-1))]
        p-[var(--ptah-surface-pad)]"
    >
      <div class="actions">
        <h4 class="proposal-name min-w-0 font-semibold" [title]="proposal().name">
          {{ proposal().name }}
        </h4>
        <button
          #opener
          ptahButton
          variant="outline"
          size="xs"
          type="button"
          [attr.aria-disabled]="disabledReason() || createdPath() ? 'true' : null"
          (click)="requestPreview(opener)"
        >
          Preview draft
        </button>
      </div>

      <span ptahBadge tone="accent" size="xs">Build</span>
      <p class="text-xs text-base-content-muted">
        @if (hasLinkedInstall()) {
          A project skill can add what the installed skill does not cover
        } @else {
          No registry skill fits
        }
      </p>

      <div class="actions">
        <p class="description truncate text-sm">{{ proposal().description }}</p>
        <button
          ptahButton
          variant="ghost"
          size="xs"
          type="button"
          [attr.aria-expanded]="detailsExpanded()"
          [attr.aria-controls]="detailsId"
          (click)="detailsExpanded.set(!detailsExpanded())"
        >
          {{ detailsExpanded() ? 'Less' : 'More' }}
        </button>
      </div>

      @if (!detailsExpanded()) {
        <ul class="space-y-1 text-xs">
          @for (entry of linkedItems(); track entry.itemId) {
            <li class="truncate">
              <strong>{{ entry.name }}</strong>
              @for (reason of entry.buildReasons; track $index) {
                <span> · {{ reason }}</span>
              }
            </li>
          }
        </ul>
      }

      <div [id]="detailsId" [hidden]="!detailsExpanded()" class="full-details space-y-2">
        <p class="font-semibold">{{ proposal().name }}</p>
        <p class="text-sm">{{ proposal().description }}</p>
        @if (linkedItems().length) {
          <ul class="space-y-1 text-xs" aria-label="Covered stack items">
            @for (entry of linkedItems(); track entry.itemId) {
              <li>
                <strong>{{ entry.name }}</strong>
                @for (reason of entry.buildReasons; track $index) {
                  <span class="block">{{ reason }}</span>
                }
              </li>
            }
          </ul>
        }
      </div>

      @if (searchFailed()) {
        <p class="text-xs text-base-content-muted">
          Judged without registry candidates (search failed)
        </p>
      }
      @if (createdPath(); as path) {
        <p class="full-details text-sm" role="status">Created: {{ path }}</p>
      } @else if (disabledReason(); as reason) {
        <p class="text-xs text-base-content-muted">{{ reason }}</p>
      }
      <ng-content />
    </article>
  `,
  styles: `
    .proposal-name {
      overflow-wrap: normal;
      word-break: normal;
      hyphens: none;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--ptah-space-2);
      min-width: 0;
    }
    .actions > button {
      flex: 0 0 auto;
      white-space: nowrap;
      max-width: 100%;
    }
    .description {
      flex: 1 1 9rem;
      min-width: 0;
    }
    .full-details {
      overflow-wrap: normal;
      word-break: normal;
      hyphens: none;
      overflow-x: auto;
    }
  `,
})
export class SkillBuildRowComponent {
  public readonly proposal = input.required<SkillBuildProposal>();
  public readonly items = input.required<readonly SkillJudgeItem[]>();
  public readonly runId = input.required<string>();
  public readonly disabledReason = input<string | null>(null);
  public readonly createdPath = input<string | null>(null);
  public readonly previewRequested = output<SkillBuildPreviewRequest>();

  protected readonly detailsId = `skill-build-details-${nextDetailsId++}`;
  protected readonly detailsExpanded = signal(false);

  private readonly linkedJudgeItems = computed(() => {
    const ids = new Set(this.proposal().itemIds);
    return this.items().filter((item) => ids.has(item.itemId));
  });

  protected readonly hasLinkedInstall = computed(() =>
    this.linkedJudgeItems().some((item) =>
      item.outcomes.some((outcome) => outcome.verdict === 'install'),
    ),
  );

  protected readonly searchFailed = computed(() =>
    this.linkedJudgeItems().some((item) => item.registry === 'search-failed'),
  );

  protected readonly linkedItems = computed<WizardGenerateSkillDraftParams['items']>(() => {
    const { proposalId } = this.proposal();
    return this.linkedJudgeItems().map(({ itemId, item, outcomes }) => ({
      itemId,
      name: item.name,
      kind: item.kind,
      evidence: item.evidence,
      buildReasons: outcomes
        .filter((outcome) => outcome.verdict === 'build' && outcome.proposalId === proposalId)
        .map((outcome) => outcome.reason),
    }));
  });

  protected requestPreview(opener: HTMLButtonElement): void {
    if (this.disabledReason() || this.createdPath()) return;
    const { proposalId, name: proposalName } = this.proposal();
    this.previewRequested.emit({
      params: { runId: this.runId(), proposalId, proposalName, items: this.linkedItems() },
      opener,
    });
  }
}
