import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { cliMarkFor } from '@ptah-extension/chat-ui';
import {
  ChevronDown,
  Ellipsis,
  LucideAngularModule,
  Plus,
} from 'lucide-angular';
import {
  NativePopoverComponent,
  PtahBadgeDirective,
  ProviderMarkComponent,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahCheckboxDirective,
} from '@ptah-extension/ui';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import {
  cliTestFailedText,
  type CliTierBadge,
  type InstanceCliMatrixRow,
  type PtahCliInstanceCell,
  type PtahCliInstanceOpenCell,
  type PtahCliInstanceToggle,
} from './cli-matrix-rows';
import {
  CLI_MATRIX_CELL_BASE,
  CLI_MATRIX_DOT,
  CLI_MATRIX_FOCUS,
} from './cli-matrix-styles';
import { CliModelEffortPopoverComponent } from './cli-model-effort-popover.component';
import { cliCapabilityView } from './cli-capability-view';

/** The three tiers of an instance's mapping, in the tier modal's order. */
const TIERS: readonly Pick<CliTierBadge, 'tier' | 'label'>[] = [
  { tier: 'sonnet', label: 'Sonnet' },
  { tier: 'opus', label: 'Opus' },
  { tier: 'haiku', label: 'Haiku' },
];
/** A card cell may take the card's full width (the table's cells cap at a column width). */
const CELL = `${CLI_MATRIX_CELL_BASE} max-w-full`;
const MENU_ITEM = `btn btn-ghost btn-sm w-full justify-start px-2 text-sm font-medium text-base-content ${CLI_MATRIX_FOCUS}`;
const LABEL =
  'text-xs font-semibold uppercase tracking-wide text-base-content-muted';

/**
 * The Ptah CLI instances of the CLI matrix card, under the system CLI table and a hairline: what an instance is, a
 * clear Add, and one card per instance (on/off, name, provider, status, key status, model and effort, the three tier
 * models, the last Test, and Tiers / Test / More: Edit, Delete).
 *
 * Presentational: the matrix passes the rows and its busy / open / delete state, and owns every write, modal and focus
 * return through the outputs. Below 28rem Tiers and Test move into More (their `cli-matrix-more-*` items).
 */
@Component({
  selector: 'ptah-cli-instances',
  standalone: true,
  imports: [
    LucideAngularModule,
    NativePopoverComponent,
    PtahBadgeDirective,
    ProviderMarkComponent,
    SettingsBusyDisabledDirective,
    CliModelEffortPopoverComponent,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahCheckboxDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ptah-cli-instances.component.html',
  styles: `
    :host-context([data-glass='on']) [data-testid='cli-instances'] {
      padding: 1.25rem;
    }
    :host {
      display: block;
      container-type: inline-size;
    }
    .inst-menu-action {
      display: none;
    }
    /* Model and effort beside the tier models once the card has room for both (1024 px Electron with the Workspaces
       panel open, glass included: about 36rem). */
    @container (min-width: 761px) {
      .inst-details {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
      }
    }
    /* A very narrow box: Tiers and Test move into More. */
    @container (max-width: 27.99rem) {
      .inst-inline-action {
        display: none;
      }
      .inst-menu-action {
        display: inline-flex;
      }
    }
  `,
})
export class PtahCliInstancesComponent {
  protected readonly capabilitiesOpen = signal<string | null>(null);
  protected capabilityView(row: InstanceCliMatrixRow) {
    return cliCapabilityView(row.manifest);
  }
  protected capabilityBadges(row: InstanceCliMatrixRow) {
    return this.capabilityView(row).badges.slice(0, 3);
  }
  /** Provider mark of a Ptah CLI instance; the Ptah `P` when the provider has none. */
  protected markId(providerId: string): string {
    const mark = cliMarkFor('ptah-cli', providerId);
    return mark.kind === 'provider' ? mark.providerId : 'ptah-cli';
  }
  protected readonly PlusIcon = Plus;
  protected readonly MoreIcon = Ellipsis;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly cell = CELL;
  protected readonly menuItem = MENU_ITEM;
  protected readonly label = LABEL;
  protected readonly dot = CLI_MATRIX_DOT;
  protected readonly unsetTitle =
    "No model of its own: uses the provider's CLI-agent tier, else the provider default.";

  /** The instance rows, in the preferred order. */
  readonly rows = input.required<readonly InstanceCliMatrixRow[]>();
  /** The instance list is loaded and holds none. */
  readonly empty = input(false);
  readonly busy = input(false);
  readonly canWrite = input(false);
  readonly testing = input(false);
  readonly testingId = input<string | null>(null);
  readonly confirmDeleteId = input<string | null>(null);
  /** The matrix's one open popover (any row of the card). */
  readonly openCell = input<PtahCliInstanceOpenCell | null>(null);

  readonly addRequested = output<'header' | 'empty'>();
  readonly toggled = output<PtahCliInstanceToggle>();
  readonly cellToggled = output<{
    readonly rowId: string;
    readonly kind: PtahCliInstanceCell;
  }>();
  /** A model or effort popover is positioned: the matrix focuses its first control. */
  readonly cellOpened = output<void>();
  readonly moreOpened = output<void>();
  readonly closed = output<void>();
  readonly tiersRequested = output<InstanceCliMatrixRow>();
  readonly testRequested = output<string>();
  readonly editRequested = output<InstanceCliMatrixRow>();
  readonly deleteAsked = output<string>();
  readonly deleteCancelled = output<string>();
  readonly deleteConfirmed = output<InstanceCliMatrixRow>();

  protected isOpen(rowId: string, kind: PtahCliInstanceCell): boolean {
    const open = this.openCell();
    return open?.rowId === rowId && open.kind === kind;
  }

  protected rowOpen(rowId: string): boolean {
    return this.openCell()?.rowId === rowId;
  }

  /** The direct model; `''` = the tier mappings decide; null while the instance's saved model has not loaded. */
  protected modelValue(row: InstanceCliMatrixRow): string | null {
    return row.selectedModel === null
      ? null
      : row.selectedModel || 'provider default';
  }

  /** Every tier, mapped or not (null model = no model of its own). */
  protected tierSlots(row: InstanceCliMatrixRow): readonly {
    readonly tier: string;
    readonly label: string;
    readonly model: string | null;
  }[] {
    return TIERS.map(({ tier, label }) => ({
      tier,
      label,
      model: row.tiers?.find((badge) => badge.tier === tier)?.model ?? null,
    }));
  }

  protected tierSummary(row: InstanceCliMatrixRow): string {
    if (row.tiers === null) return 'loading';
    return row.tiers.length
      ? `${row.tiers.length} of ${TIERS.length} set`
      : 'none set';
  }

  protected tierList(row: InstanceCliMatrixRow): string {
    if (!row.tiers?.length) return 'No tier models';
    return this.tierSlots(row)
      .map((tier) => `${tier.label}: ${tier.model ?? 'Not set'}`)
      .join(', ');
  }

  /** This instance's last Test as the state reports it (S1: a new run drops the previous result). */
  protected testText(row: InstanceCliMatrixRow): string {
    if (!row.lastTest) return 'Not run yet';
    if (row.lastTest.success)
      return row.lastTest.latencyMs === null
        ? 'Passed'
        : `Passed in ${row.lastTest.latencyMs}ms`;
    return cliTestFailedText(row.lastTest.reason);
  }
}
