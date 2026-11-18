import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import type { CliLaneDefaults } from '@ptah-extension/shared';
import {
  PtahButtonDirective,
  ProviderMarkComponent,
  PtahTableRowTitleComponent,
} from '@ptah-extension/ui';
import { cliMarkFor } from '@ptah-extension/chat-ui';
import type { LaneTableRow } from './lanes-table.component';
import { LaneDefaultWarningComponent } from './lanes-table-status.component';

@Component({
  selector: 'ptah-lane-row-identity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [
    PtahButtonDirective,
    ProviderMarkComponent,
    PtahTableRowTitleComponent,
    LaneDefaultWarningComponent,
  ],
  styles: `
    ptah-lane-row-identity {
      display: block;
      position: relative;
      container-type: inline-size;
      min-width: 0;
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
    }
    ptah-lane-row-identity
      .lane-install-guide[data-ptah-button]:is(.btn, #ptah-button) {
      position: static;
      display: block;
      width: fit-content;
      max-width: 100%;
      margin: 0;
      padding: 0;
      line-height: 1rem;
      min-height: 1rem;
      height: auto;
      font-size: 0.75rem;
      white-space: nowrap;
    }
    ptah-lane-row-identity[data-uninstalled='true']
      .ptah-table-row-title-secondary {
      visibility: hidden;
    }
    ptah-lane-row-identity[data-collapsed='true'] .ptah-table-row-title-kind {
      position: static;
      grid-column: 1 / -1;
      grid-row: 2;
      justify-self: start;
      line-height: 1rem;
      font-family: var(--ptah-font-sans);
    }
    ptah-lane-row-identity[data-collapsed='true']
      .ptah-table-row-title-secondary[class] {
      margin-left: 5rem;
      max-width: calc(100% - 5rem);
    }
    ptah-lane-row-identity
      ptah-table-row-title:not(:has(.ptah-table-row-title-secondary)) {
      justify-content: center;
    }
    ptah-lane-row-identity[data-collapsed='true'] ptah-table-row-title {
      height: auto;
      justify-content: start;
    }
    ptah-lane-row-identity[data-collapsed='true']
      .ptah-table-row-title-primary[class] {
      display: grid;
      grid-template-columns: auto auto auto;
      justify-content: start;
      align-items: center;
    }
    ptah-lane-row-identity[data-collapsed='true'] ptah-lane-default-warning {
      grid-column: 3;
      grid-row: 1;
    }
    ptah-lane-row-identity[data-collapsed='true']
      .ptah-table-row-title-secondary[class] {
      display: none;
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
      ptah-lane-row-identity .ptah-table-row-title-secondary[class] {
        margin-left: 5rem;
        max-width: calc(100% - 5rem);
      }
    }
  `,
  host: {
    '[attr.data-collapsed]': 'collapsed()',
    '[attr.data-uninstalled]':
      "row().kind === 'system' && row().status.kind === 'not-installed'",
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
      [kind]="row.kind === 'system' ? 'CLI agent' : 'Ptah CLI'"
      [secondary]="
        collapsed()
          ? ''
          : row.kind === 'system'
            ? row.versionLabel || ''
            : row.provider
      "
      [mono]="row.kind === 'system'"
    >
      <ptah-provider-mark
        ptahRowMark
        [providerId]="row.kind === 'system' ? row.cli : markId(row.providerId)"
        fallback="Terminal"
        size="sm"
      />
      <ptah-lane-default-warning
        ptahRowInfo
        [row]="row"
        [saved]="row.kind === 'system' ? defaults()?.[row.cli] : undefined"
      />
    </ptah-table-row-title>
    @if (collapsed() && row.status.kind === 'not-installed') {
      <button
        type="button"
        ptahButton
        variant="link"
        size="xs"
        noPadding
        class="lane-install-guide"
        (click)="installGuideRequested.emit()"
      >
        Install guide
      </button>
    }`,
})
export class LaneRowIdentityComponent {
  readonly row = input.required<LaneTableRow>();
  readonly collapsed = input(false);
  readonly installGuideRequested = output<void>();
  readonly defaults = input<CliLaneDefaults>();
  protected markId(providerId: string): string {
    const mark = cliMarkFor('ptah-cli', providerId);
    return mark.kind === 'provider' ? mark.providerId : 'ptah-cli';
  }
}
