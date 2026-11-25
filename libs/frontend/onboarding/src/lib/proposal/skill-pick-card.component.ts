import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import type { SkillShEntry } from '@ptah-extension/shared';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahCheckboxDirective,
} from '@ptah-extension/ui';
import { Download, ExternalLink, LucideAngularModule } from 'lucide-angular';
import { formatInstallCount } from './stack-coverage';

let nextCardId = 0;

@Component({
  selector: 'ptah-skill-pick-card',
  standalone: true,
  imports: [
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahCheckboxDirective,
    LucideAngularModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  templateUrl: './skill-pick-card.component.html',
  styles: `
    .skill-card-name {
      overflow-wrap: normal;
      word-break: normal;
      hyphens: none;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .skill-card-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--ptah-space-2);
      min-width: 0;
    }
    .skill-card-actions > button {
      flex: 0 0 auto;
      white-space: nowrap;
      max-width: 100%;
    }
    .skill-card-details {
      overflow-wrap: normal;
      word-break: normal;
      hyphens: none;
      overflow-x: auto;
    }
  `,
})
export class SkillPickCardComponent {
  public readonly skill = input.required<SkillShEntry>();
  public readonly coveredItems = input<string[]>([]);
  public readonly rawEvidence = input<string | null>(null);
  public readonly selected = input(false);
  public readonly highlightItem = input<string | null>(null);
  public readonly disabled = input(false);
  /** Judged Install card (R22): one-line description and reason, "More" reveals the rest. */
  public readonly compact = input(false);
  /** Judge reason of the Install verdict; one line when collapsed, full when expanded. */
  public readonly reason = input<string | null>(null);
  /** Note about scripts or executable files in the skill; shown only after "More". */
  public readonly scriptNote = input<string | null>(null);
  public readonly toggled = output<void>();
  protected readonly visibleCoveredItems = computed(() => {
    const items = this.coveredItems();
    const active = this.highlightItem();
    const first = items.slice(0, 3);
    return active && items.includes(active) && !first.includes(active)
      ? [...first.slice(0, 2), active]
      : first;
  });
  protected readonly download = Download;
  protected readonly externalLink = ExternalLink;
  protected readonly installs = computed(() =>
    formatInstallCount(this.skill().installs),
  );
  protected readonly fullInstalls = computed(() =>
    new Intl.NumberFormat('en-US').format(this.skill().installs),
  );
  protected readonly description = computed(
    () =>
      this.skill().description.trim() ||
      `${this.skill().source} - ${this.fullInstalls()} installs`,
  );
  /** Unique per rendering: one candidate can render in several places (R19). */
  private readonly instanceId = nextCardId++;
  protected readonly descriptionId = `skill-meta-${this.instanceId}`;
  protected readonly detailsId = `skill-details-${this.instanceId}`;
  protected readonly detailsExpanded = signal(false);
  protected toggleDetails(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.detailsExpanded.update((open) => !open);
  }
  protected readonly safeUrl = computed(() => {
    try {
      const url = new URL(this.skill().url ?? '');
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      // degradation-audit: optional-capability - a missing or invalid marketing URL only omits the link.
      return null;
    }
  });
  protected stopLink(event: Event): void {
    event.stopPropagation();
  }
}
