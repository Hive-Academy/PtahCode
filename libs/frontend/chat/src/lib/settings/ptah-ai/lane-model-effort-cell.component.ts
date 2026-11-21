import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  NativePopoverComponent,
  PtahButtonDirective,
} from '@ptah-extension/ui';
import { cliModelDisplay } from './cli-matrix-rows';
import { CliModelEffortPopoverComponent } from './cli-model-effort-popover.component';
import type { LaneTableRow } from './lanes-table.component';

/** Model text. Instance: null = not loaded, '' = the tier mappings decide. */
export function laneModelDisplay(row: LaneTableRow): {
  label: string;
  title: string;
} {
  if (row.kind === 'system') {
    if (!row.model.value) {
      return { label: 'CLI default', title: 'CLI default' };
    }
    return cliModelDisplay(row.model.value);
  }
  if (row.selectedModel === null) return { label: '—', title: 'Not loaded' };
  const label = row.selectedModel || 'Provider default';
  return { label, title: label };
}

/**
 * Splits a model id after the one hyphen that makes its longer part shortest. The row renders the parts as two
 * no-wrap spans with one `<wbr>` between them, so a compact row shows the id on at most two lines with any line
 * breaker ("claude-" / "sonnet-4-6"). Returns null for an id with white space or with no inner hyphen; such a label
 * keeps the normal line breaks.
 */
export function splitModelId(id: string): readonly [string, string] | null {
  if (/\s/.test(id)) return null;
  let best: readonly [string, string] | null = null;
  for (
    let i = id.indexOf('-');
    i > 0 && i < id.length - 1;
    i = id.indexOf('-', i + 1)
  ) {
    const parts = [id.slice(0, i + 1), id.slice(i + 1)] as const;
    const longest = Math.max(parts[0].length, parts[1].length);
    if (!best || longest < Math.max(best[0].length, best[1].length)) {
      best = parts;
    }
  }
  return best;
}

/**
 * The model and effort triggers of one lane, in the table row (`cell`) or in the expanded
 * detail (`detail`). The lanes table owns which popover is open (one at a time) and the
 * focus return; this cell only shows `openField` and reports the clicks.
 */
@Component({
  selector: 'ptah-lane-model-effort-cell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NativePopoverComponent,
    PtahButtonDirective,
    CliModelEffortPopoverComponent,
  ],
  // The host takes the place of the former `span.lane-model-value`, so the table styles
  // and the DOM depth stay the same.
  host: {
    class:
      'lane-model-value inline-flex min-w-0 items-center gap-ptah-inline text-xs',
  },
  template: `
    @let row = this.row();
    @let model = this.model();
    @if (row.kind === 'instance' && row.selectedModel === null) {
      <span [title]="model.title">{{ model.label }}</span>
    } @else {
      <ptah-native-popover
        [isOpen]="openField() === 'model'"
        [keepInViewport]="true"
        placement="bottom-start"
        [hasBackdrop]="true"
        backdropClass="transparent"
        (closed)="closed.emit()"
      >
        <button
          trigger
          type="button"
          ptahButton
          variant="ghost"
          size="xs"
          density="compact"
          class="min-w-0 lane-model-trigger"
          [class.font-mono]="hasModelId()"
          noPadding
          data-popover-kind="model"
          [disabled]="!interactive() || !canWrite()"
          [attr.data-busy]="busy() ? '' : null"
          [attr.aria-disabled]="busy() ? 'true' : null"
          [attr.aria-busy]="busy() ? 'true' : null"
          [attr.aria-label]="'Model default for ' + row.name"
          [attr.aria-expanded]="openField() === 'model'"
          [title]="model.title"
          (click)="toggled.emit('model')"
        >
          @if (modelParts(); as parts) {
            <span class="lane-model-id"
              ><span class="lane-model-part">{{ parts[0] }}</span
              ><wbr /><span class="lane-model-part">{{ parts[1] }}</span></span
            >
          } @else {
            {{ model.label }}
          }
        </button>
        @if (openField() === 'model') {
          <ptah-cli-model-effort-popover
            content
            [row]="row"
            field="model"
            (closed)="closed.emit()"
          />
        }
      </ptah-native-popover>
    }
    @if (
      hasEffort() &&
      (place() === 'detail' ||
        (row.kind === 'system' ? row.effort?.value : row.effort))
    ) {
      @if (place() !== 'detail') {
        <span aria-hidden="true">·</span>
      }
      <ptah-native-popover
        [isOpen]="openField() === 'effort'"
        [keepInViewport]="true"
        placement="bottom-start"
        [hasBackdrop]="true"
        backdropClass="transparent"
        (closed)="closed.emit()"
      >
        <button
          trigger
          type="button"
          ptahButton
          [variant]="place() === 'detail' ? 'outline' : 'ghost'"
          size="xs"
          density="compact"
          data-popover-kind="effort"
          [disabled]="!interactive() || !canWrite()"
          [attr.data-busy]="busy() ? '' : null"
          [attr.aria-disabled]="busy() ? 'true' : null"
          [attr.aria-busy]="busy() ? 'true' : null"
          [attr.aria-label]="'Effort default for ' + row.name"
          [attr.aria-expanded]="openField() === 'effort'"
          [title]="effort()"
          (click)="toggled.emit('effort')"
        >
          {{ place() === 'detail' ? 'Effort: ' : '' }}{{ effort() }}
        </button>
        @if (openField() === 'effort') {
          <ptah-cli-model-effort-popover
            content
            [row]="row"
            field="effort"
            (closed)="closed.emit()"
          />
        }
      </ptah-native-popover>
    }
    <span class="sr-only" data-testid="lanes-effort-na"></span>
  `,
})
export class LaneModelEffortCellComponent {
  readonly row = input.required<LaneTableRow>();
  readonly place = input.required<'cell' | 'detail'>();
  /** The field whose popover is open at this place, from the table's one-popover state. */
  readonly openField = input<'model' | 'effort' | null>(null);
  readonly interactive = input(true);
  readonly canWrite = input(true);
  readonly busy = input(false);
  readonly toggled = output<'model' | 'effort'>();
  readonly closed = output<void>();

  protected readonly model = computed(() => laneModelDisplay(this.row()));
  protected readonly effort = computed(() => {
    const row = this.row();
    return (
      (row.kind === 'system' ? row.effort?.value : row.effort) || 'default'
    );
  });
  /**
   * The lane has an effort setting: instances always, a system lane when its CLI has one
   * (`effort` is null otherwise). An unset effort keeps the trigger ("default"), because
   * the trigger is the only way to choose an effort. An instance whose model is not
   * loaded yet (`selectedModel` null) shows no trigger.
   */
  protected readonly hasEffort = computed(() => {
    const row = this.row();
    if (row.kind === 'instance') return row.selectedModel !== null;
    return row.effort != null;
  });
  protected readonly hasModelId = computed(() => {
    const row = this.row();
    return !!(row.kind === 'system' ? row.model.value : row.selectedModel);
  });
  /** A model id as at most two unbreakable parts (see `splitModelId`). */
  protected readonly modelParts = computed(() =>
    this.hasModelId() ? splitModelId(this.model().label) : null,
  );
}
