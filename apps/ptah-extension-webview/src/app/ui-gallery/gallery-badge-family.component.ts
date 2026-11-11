import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  PtahBadgeDirective,
  PtahBadgeTone,
  PtahStatus,
  PtahStatusComponent,
} from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

/** Gallery section of the badge family (TASK_2026_957_fda3, family-3-look.md). */
@Component({
  selector: 'ptah-gallery-badge-family',
  standalone: true,
  imports: [GallerySectionComponent, PtahBadgeDirective, PtahStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-gallery-section id="family-badge" title="Badge and status family">
    <p class="text-ptah-hint text-base-content-muted">
      Static labels. A badge is not a button: it has no hover, focus or
      disabled state. The word carries the meaning. A status glyph has its
      own shape for each state, so color is never the only cue.
    </p>
    <div data-testid="badge-family-reference" class="flex flex-col gap-ptah-group">
      @for (appearance of appearances; track appearance) {
        @for (size of sizes; track size) {
          <div class="flex flex-wrap items-center gap-ptah-inline">
            <span class="text-ptah-caption text-base-content-muted w-28">
              {{ appearance }} / {{ size }}
            </span>
            @for (tone of tones; track tone) {
              <span ptahBadge [tone]="tone" [appearance]="appearance" [size]="size">{{ tone }}</span>
            }
          </div>
        }
      }

      <div class="flex flex-wrap items-center gap-ptah-inline">
        <span class="text-ptah-caption text-base-content-muted w-28">count</span>
        <span ptahBadge count size="xs">3</span>
        <span ptahBadge count>12</span>
        <span ptahBadge count tone="accent">128</span>
        <span ptahBadge count tone="err" appearance="outline">4</span>
      </div>

      <div class="flex flex-wrap items-center gap-ptah-inline">
        <span class="text-ptah-caption text-base-content-muted w-28">long text</span>
        <span ptahBadge class="max-w-40" title="claude-opus-5-5 with a very long model label">
          claude-opus-5-5 with a very long model label
        </span>
      </div>

      @for (appearance of statusAppearances; track appearance) {
        <div class="flex flex-wrap items-center gap-ptah-inline">
          <span class="text-ptah-caption text-base-content-muted w-28">status {{ appearance }}</span>
          @for (status of statuses; track status) {
            <ptah-status [status]="status" [appearance]="appearance" />
          }
        </div>
      }
      <div class="flex flex-wrap items-center gap-ptah-inline">
        <span class="text-ptah-caption text-base-content-muted w-28">status xs</span>
        @for (status of statuses; track status) {
          <ptah-status [status]="status" size="xs" />
        }
      </div>
    </div>
  </ptah-gallery-section>`,
})
export class GalleryBadgeFamilyComponent {
  public readonly tones: readonly PtahBadgeTone[] = ['neutral', 'accent', 'info', 'ok', 'warn', 'err'];
  public readonly appearances = ['soft', 'outline'] as const;
  public readonly sizes = ['sm', 'xs'] as const;
  public readonly statusAppearances = ['pill', 'inline', 'dot'] as const;
  public readonly statuses: readonly PtahStatus[] = ['running', 'queued', 'needs-review', 'failed', 'completed'];
}
