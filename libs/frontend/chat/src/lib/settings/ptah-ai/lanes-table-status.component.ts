import {
  computed,
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Info,
  KeyRound,
  Loader2,
  LucideAngularModule,
  type LucideIconData,
} from 'lucide-angular';
import { PtahIconButtonDirective } from '@ptah-extension/ui';
import { resolveCliLaneDefaultPair } from '@ptah-extension/shared';
import type { CliLaneDefaults, CliType } from '@ptah-extension/shared';
import type { CliMatrixStatus } from './cli-matrix-rows';
import type { LaneTableRow } from './lanes-table.component';

/** The state ink of a lane status; the same names as `ptah-status` (`data-ink`). */
export type LaneStatusInk = 'done' | 'need' | 'err' | 'run' | 'idle';

const INK: Readonly<Record<CliMatrixStatus['tone'], LaneStatusInk>> = {
  success: 'done',
  warning: 'need',
  error: 'err',
  info: 'run',
  neutral: 'idle',
};
/** The icon carries the state colour; the status text stays `base-content`. */
const INK_CLASS: Readonly<Record<LaneStatusInk, string>> = {
  done: 'text-success',
  need: 'text-warning',
  err: 'text-error',
  run: 'text-info',
  idle: 'text-base-content-muted',
};

/** Icon, ink and motion of one lane status. Each state has its own shape, so colour is not the only signal. */
export function laneStatusGlyph(status: CliMatrixStatus): {
  readonly icon: LucideIconData;
  readonly ink: LaneStatusInk;
  readonly spin: boolean;
} {
  const ink = INK[status.tone];
  if (status.kind === 'needs-key') return { icon: KeyRound, ink, spin: false };
  if (status.kind === 'initializing' || ink === 'run')
    return { icon: Loader2, ink, spin: true };
  if (ink === 'done') return { icon: CircleCheck, ink, spin: false };
  if (ink === 'idle') return { icon: CircleDashed, ink, spin: false };
  return { icon: CircleAlert, ink, spin: false };
}

/**
 * The state icon of a lane. With `label` it is the whole status (the narrow table shows it beside
 * the lane name) and has an accessible name; without one it is decoration beside the status text.
 */
@Component({
  selector: 'ptah-lane-status-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  host: {
    class: 'inline-flex shrink-0',
    // The icon draws with currentColor. (lucide-angular takes `class` as an input, so the ink is set here.)
    '[class]': 'inkClass()',
    '[attr.data-ink]': 'glyph().ink',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[attr.title]': 'label() || null',
    '[attr.aria-hidden]': 'label() ? null : "true"',
  },
  template: `<lucide-angular
    [img]="glyph().icon"
    class="h-3.5 w-3.5"
    [class.animate-spin]="glyph().spin"
    aria-hidden="true"
  />`,
})
export class LaneStatusIconComponent {
  readonly status = input.required<CliMatrixStatus>();
  readonly label = input('');
  protected readonly glyph = computed(() => laneStatusGlyph(this.status()));
  protected readonly inkClass = computed(() => INK_CLASS[this.glyph().ink]);
}

/** Status of one lane: a state icon and the status text. */
@Component({
  selector: 'ptah-lanes-table-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LaneStatusIconComponent],
  template: `
    <span
      class="inline-flex min-w-0 items-center gap-[var(--ptah-gap-inline)] align-middle text-xs text-base-content"
      [attr.data-ink]="ink()"
      [attr.title]="row().status.label"
      [attr.data-testid]="
        row().kind === 'instance' ? 'cli-matrix-status' : null
      "
    >
      <ptah-lane-status-icon [status]="row().status" />
      <span class="ptah-status-text">{{ label() }}</span>
    </span>
    @if (testing() || testResult()) {
      <span class="sr-only">{{ testing() ? 'Running…' : testResult() }}</span>
    }
    @if (row().kind === 'instance') {
      @if (instanceRow()?.runtimeStatus; as runtimeStatus) {
        <span class="sr-only" data-testid="cli-matrix-runtime-status">{{
          runtimeStatus
        }}</span>
      }
      @if (instanceRow()?.keyStatus?.kind === 'missing') {
        <span class="sr-only" data-testid="cli-matrix-key-status">{{
          instanceRow()?.keyStatus?.label
        }}</span>
      }
    }
  `,
})
export class LanesTableStatusComponent {
  readonly row = input.required<LaneTableRow>();
  readonly collapsed = input(false);
  readonly testing = input(false);
  protected readonly label = computed(() => {
    const status = this.row().status;
    if (this.collapsed()) {
      if (status.kind === 'not-installed') return 'Missing';
    }
    return status.label;
  });
  readonly testResult = input('');
  protected readonly ink = computed(
    () => laneStatusGlyph(this.row().status).ink,
  );

  protected instanceRow() {
    const row = this.row();
    return row.kind === 'instance' ? row : null;
  }
}

/** Compact unsupported state belongs with the lane identity, never above a select. */
@Component({
  selector: 'ptah-lane-default-warning',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, PtahIconButtonDirective],
  template: `@if (reason(); as reason) {
    <button
      type="button"
      ptahIconButton
      size="xs"
      density="compact"
      [label]="'Unsupported combination: ' + reason"
      data-testid="lane-default-warning"
    >
      <lucide-angular [img]="InfoIcon" class="h-3.5 w-3.5" aria-hidden="true" />
      <span class="sr-only">Unsupported combination: {{ reason }}</span>
    </button>
  }`,
})
export class LaneDefaultWarningComponent {
  protected readonly InfoIcon = Info;
  readonly row = input.required<LaneTableRow>();
  readonly saved = input<CliLaneDefaults[CliType]>();
  protected readonly reason = computed(() => {
    const row = this.row();
    if (row.kind !== 'system' || !row.manifest) return null;
    const pair = resolveCliLaneDefaultPair(row.manifest, this.saved());
    return 'unsupported' in pair ? pair.unsupported : null;
  });
}
