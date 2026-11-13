import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  Archive,
  Brain,
  Clock,
  Code,
  Database,
  LucideAngularModule,
} from 'lucide-angular';
import { PtahStatComponent } from '@ptah-extension/ui';

export interface MemoryStatCounts {
  readonly core: number;
  readonly recall: number;
  readonly archival: number;
  readonly codeIndex: number;
}

// Left raw: the Recall tile uses the theme text-info color, but ptah-stat maps info to the state color.
@Component({
  selector: 'ptah-memory-stats-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, PtahStatComponent],
  template: `
    @let c = counts();
    <div
      class="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3"
      aria-label="Memory tier statistics"
    >
          <ptah-stat layout="tile" radius="xl" label="Core" [value]="c.core" valueTone="primary" data-testid="memory-stat-core">
            <lucide-angular ptahStatIcon [img]="BrainIcon" class="w-6 h-6 text-primary" aria-hidden="true" />
          </ptah-stat>

          <!-- Raw tile: ptah-stat info maps to state-run, which differs from theme text-info. -->
          <div data-testid="memory-stat-recall-tile" class="surface-2 min-w-0 overflow-hidden rounded-xl">
        <div class="stat min-w-0 overflow-hidden p-4">
          <div class="stat-figure text-info">
            <lucide-angular
              [img]="DatabaseIcon"
              class="w-6 h-6"
              aria-hidden="true"
            />
          </div>
          <div class="stat-title min-w-0 whitespace-normal text-base-content-muted">Recall</div>
          <div
            data-testid="memory-stat-recall"
            class="stat-value text-2xl text-info tabular-nums"
          >
            {{ c.recall }}
          </div>
        </div>
      </div>

          <ptah-stat layout="tile" radius="xl" label="Archival" [value]="c.archival" valueTone="muted" data-testid="memory-stat-archival">
            <lucide-angular ptahStatIcon [img]="ArchiveIcon" class="w-6 h-6 text-base-content-muted" aria-hidden="true" />
          </ptah-stat>

          <ptah-stat layout="tile" radius="xl" label="Code index" [value]="c.codeIndex" valueTone="secondary" data-testid="memory-stat-code-index" title="Indexed code symbols (functions, classes, methods) — shown separately from curated memory">
            <lucide-angular ptahStatIcon [img]="CodeIcon" class="w-6 h-6 text-secondary" aria-hidden="true" />
          </ptah-stat>

          <ptah-stat layout="tile" radius="xl" label="Last curated" [value]="lastCuratedLabel()" valueTone="muted" data-testid="memory-stat-last-curated" valueWrap="break-words" valueWeight="medium">
            <lucide-angular ptahStatIcon [img]="ClockIcon" class="w-6 h-6 text-base-content-muted" aria-hidden="true" />
          </ptah-stat>
        </div>
  `,
})
export class MemoryStatsStripComponent {
  public readonly counts = input.required<MemoryStatCounts>();
  public readonly lastCuratedLabel = input<string>('never');

  protected readonly BrainIcon = Brain;
  protected readonly DatabaseIcon = Database;
  protected readonly ArchiveIcon = Archive;
  protected readonly CodeIcon = Code;
  protected readonly ClockIcon = Clock;
}
