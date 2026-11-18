import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { SkillShEntry } from '@ptah-extension/shared';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahCheckboxDirective,
} from '@ptah-extension/ui';
import { Download, ExternalLink, LucideAngularModule } from 'lucide-angular';
import { formatInstallCount } from './stack-coverage';

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
})
export class SkillPickCardComponent {
  public readonly skill = input.required<SkillShEntry>();
  public readonly coveredItems = input<string[]>([]);
  public readonly rawEvidence = input<string | null>(null);
  public readonly selected = input(false);
  public readonly highlightItem = input<string | null>(null);
  public readonly disabled = input(false);
  public readonly toggled = output<void>();
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
  protected readonly descriptionId = computed(
    () =>
      `skill-meta-${encodeURIComponent(`${this.skill().source}/${this.skill().skillId}`)}`,
  );
  protected readonly safeUrl = computed(() => {
    try {
      const url = new URL(this.skill().url ?? '');
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    } // Missing or invalid optional marketing URL: omit the link.
  });
  protected stopLink(event: Event): void {
    event.stopPropagation();
  }
}
