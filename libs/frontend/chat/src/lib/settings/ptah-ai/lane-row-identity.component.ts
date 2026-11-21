import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  ViewEncapsulation,
} from '@angular/core';
import type { CliLaneDefaults } from '@ptah-extension/shared';
import {
  ProviderMarkComponent,
  PtahTableRowTitleComponent,
} from '@ptah-extension/ui';
import { cliMarkFor } from '@ptah-extension/chat-ui';
import type { LaneTableRow } from './lanes-table.component';
import {
  LaneDefaultWarningComponent,
  LaneStatusIconComponent,
} from './lanes-table-status.component';

/**
 * The Lane cell of a lanes table row. Always two lines: the name with its kind badge, then the
 * version (CLI agent) or the provider (Ptah CLI), or `--` when there is none, so every row has
 * the same height.
 */
@Component({
  selector: 'ptah-lane-row-identity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [
    ProviderMarkComponent,
    PtahTableRowTitleComponent,
    LaneDefaultWarningComponent,
    LaneStatusIconComponent,
  ],
  styles: `
    ptah-lane-row-identity {
      display: block;
      position: relative;
      container-type: inline-size;
      min-width: 0;
      /* Badge text inks. The theme tokens give 4.5:1 or more on the dark card surfaces. */
      --ptah-kind-cli-ink: oklch(var(--in));
      --ptah-kind-ptah-ink: oklch(var(--s));
    }
    /* On the light surfaces the info and secondary tokens are below 4.5:1, so the ink is a darker shade. */
    [data-theme-mode='light'] ptah-lane-row-identity {
      --ptah-kind-cli-ink: #1d4ed8;
      --ptah-kind-ptah-ink: #7a5900;
    }
    ptah-lane-row-identity .ptah-table-row-title-secondary[class] {
      font-size: 0.75rem;
      line-height: 1rem;
      font-weight: 400;
      color: var(--ptah-section-description-color);
      min-height: 1rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    ptah-lane-row-identity ptah-table-row-title {
      gap: 0.125rem;
      width: 100%;
      height: 2.5rem;
      justify-content: space-between;
    }
    ptah-lane-row-identity .ptah-table-row-title-primary[class] {
      gap: 0.25rem;
      min-width: 0;
    }
    ptah-lane-row-identity .ptah-table-row-title-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    ptah-lane-row-identity .ptah-table-row-title-kind {
      flex-shrink: 0;
      padding: 0 var(--ptah-gap-inline);
      border: 1px solid var(--ptah-card-border);
      border-radius: var(--ptah-radius-chip);
      font-size: var(--ptah-text-caption-size);
      font-weight: 400;
      white-space: nowrap;
    }
    ptah-lane-row-identity .ptah-table-row-title-kind.kind-cli {
      color: var(--ptah-kind-cli-ink);
      border-color: color-mix(
        in oklab,
        var(--ptah-kind-cli-ink) 50%,
        transparent
      );
    }
    ptah-lane-row-identity .ptah-table-row-title-kind.kind-ptah {
      color: var(--ptah-kind-ptah-ink);
      border-color: color-mix(
        in oklab,
        var(--ptah-kind-ptah-ink) 55%,
        transparent
      );
    }
    ptah-lane-row-identity[data-collapsed='true'] .ptah-table-row-title-kind {
      position: static;
      flex-basis: 100%;
      order: 1;
      justify-self: start;
      line-height: 1rem;
      font-family: var(--ptah-font-sans);
    }
    ptah-lane-row-identity[data-collapsed='true'] ptah-table-row-title {
      height: auto;
      justify-content: start;
    }
    ptah-lane-row-identity[data-collapsed='true']
      .ptah-table-row-title-primary[class] {
      /* Keep icon/name/info gaps intrinsic; kind takes its own flex line. */
      display: flex;
      flex-wrap: wrap;
      justify-content: start;
      align-items: center;
    }
    ptah-lane-row-identity[data-collapsed='true'] ptah-lane-default-warning {
      flex: 0 0 auto;
    }
    ptah-lane-row-identity[data-collapsed='true'] .ptah-table-row-title-name {
      white-space: nowrap;
      overflow: visible;
      overflow-wrap: normal;
      word-break: normal;
    }
    @container (max-width: 13rem) {
      ptah-lane-row-identity:not([data-collapsed='true'])
        .ptah-table-row-title-kind {
        position: absolute;
        bottom: 0;
        left: 0;
        line-height: 1rem;
        font-family: var(--ptah-font-sans);
      }
      ptah-lane-row-identity:not([data-collapsed='true'])
        .ptah-table-row-title-secondary[class] {
        margin-left: 5rem;
        max-width: calc(100% - 5rem);
      }
    }
  `,
  host: {
    '[attr.data-collapsed]': 'collapsed()',
  },
  template: ` @let row = this.row();
    <ptah-table-row-title
      [attr.data-testid]="
        row.kind === 'system' && row.versionLabel ? 'cli-matrix-version' : null
      "
      [attr.title]="
        row.name +
        (row.kind === 'system' && row.versionLabel
          ? ' - ' + row.versionLabel
          : '')
      "
      [name]="row.name"
      [secondary]="secondLine()"
      [mono]="row.kind === 'system'"
    >
      <ptah-provider-mark
        ptahRowMark
        [providerId]="row.kind === 'system' ? row.cli : markId(row.providerId)"
        fallback="Terminal"
        size="sm"
      />
      @if (statusIcon()) {
        <ptah-lane-status-icon
          ptahRowInfo
          [status]="row.status"
          [label]="row.status.label"
        />
      } @else {
        <span
          ptahRowInfo
          class="ptah-table-row-title-kind"
          [class.kind-cli]="row.kind === 'system'"
          [class.kind-ptah]="row.kind === 'instance'"
          >{{ row.kind === 'system' ? 'CLI agent' : 'Ptah CLI' }}</span
        >
      }
      <ptah-lane-default-warning
        ptahRowInfo
        [row]="row"
        [saved]="row.kind === 'system' ? defaults()?.[row.cli] : undefined"
      />
    </ptah-table-row-title>`,
})
export class LaneRowIdentityComponent {
  readonly row = input.required<LaneTableRow>();
  readonly collapsed = input(false);
  /**
   * The narrowest table has no Status column and no kind badge: the state icon then stands beside the name
   * (with the status as its accessible name) in place of the badge.
   */
  readonly statusIcon = input(false);
  readonly defaults = input<CliLaneDefaults>();
  /** Line 2 is never blank, so a row with no version or provider keeps the two-line height. */
  protected readonly secondLine = computed(() => {
    const row = this.row();
    return (row.kind === 'system' ? row.versionLabel : row.provider) || '--';
  });
  protected markId(providerId: string): string {
    const mark = cliMarkFor('ptah-cli', providerId);
    return mark.kind === 'provider' ? mark.providerId : 'ptah-cli';
  }
}
