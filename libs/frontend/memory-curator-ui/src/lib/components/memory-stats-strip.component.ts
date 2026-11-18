import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  PtahInstrumentBandComponent,
  type PtahInstrumentBandSegment,
} from '@ptah-extension/ui';

export interface MemoryStatCounts {
  readonly core: number;
  readonly recall: number;
  readonly archival: number;
  readonly codeIndex: number;
}

@Component({
  selector: 'ptah-memory-stats-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahInstrumentBandComponent],
  template: `
    <ptah-instrument-band
      ariaLabel="Memory tier statistics"
      [segments]="segments()"
    />
  `,
})
export class MemoryStatsStripComponent {
  public readonly counts = input.required<MemoryStatCounts>();
  public readonly lastCuratedLabel = input<string>('never');

  protected readonly segments = computed<readonly PtahInstrumentBandSegment[]>(
    () => {
      const c = this.counts();
      return [
        {
          id: 'core',
          label: 'Core',
          value: String(c.core),
          tone: 'ok',
          testId: 'memory-stat-core',
        },
        {
          id: 'recall',
          label: 'Recall',
          value: String(c.recall),
          tone: 'info',
          testId: 'memory-stat-recall-tile',
          valueTestId: 'memory-stat-recall',
        },
        {
          id: 'archival',
          label: 'Archival',
          value: String(c.archival),
          tone: 'idle',
          testId: 'memory-stat-archival',
        },
        {
          id: 'code-index',
          label: 'Code index',
          value: String(c.codeIndex),
          tone: 'info',
          testId: 'memory-stat-code-index',
          title:
            'Indexed code symbols (functions, classes, methods) — shown separately from curated memory',
        },
        {
          id: 'last-curated',
          label: 'Last curated',
          value: this.lastCuratedLabel(),
          tone: 'idle',
          testId: 'memory-stat-last-curated',
        },
      ];
    },
  );
}
