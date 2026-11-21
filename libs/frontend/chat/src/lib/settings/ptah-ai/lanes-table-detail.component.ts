import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChildren,
  ViewEncapsulation,
} from '@angular/core';
import type { CliType } from '@ptah-extension/shared';
import {
  NativePopoverComponent,
  PtahButtonDirective,
  PtahDescriptionListComponent,
  PtahDisclosureComponent,
  PtahTableDetailLayoutComponent,
} from '@ptah-extension/ui';
import {
  BookOpen,
  Bot,
  Gauge,
  Globe,
  KeyRound,
  Layers,
  LogIn,
  LucideAngularModule,
  MessageSquare,
  Play,
  Plug,
  Settings2,
  ShieldCheck,
  Terminal,
  ToggleRight,
  type LucideIconData,
} from 'lucide-angular';
import type { LaneTableRow } from './lanes-table.component';
import type {
  InstanceCliMatrixRow,
  SystemCliMatrixRow,
} from './cli-matrix-rows';
import { ClaudeLaneAccountCellComponent } from './claude-lane-account-cell.component';
import { CursorCredentialPopoverComponent } from './cursor-credential-popover.component';
import {
  CliProviderCardPopoversComponent,
  type CliProviderInfoKind,
} from './cli-provider-card-popovers.component';
import { CliCapabilityDetailComponent } from './cli-capability-detail.component';
import { CopilotAutoApproveToggleComponent } from './copilot-auto-approve-toggle.component';
import { cliCapabilityView } from './cli-capability-view';

/** Inline capability facts of the detail (decision 13): icon + label + value, read-only. */
const CAPABILITY_FACTS: Readonly<
  Record<string, { readonly label: string; readonly icon: LucideIconData }>
> = {
  Messaging: { label: 'Messaging', icon: MessageSquare },
  Permission: { label: 'Permission modes', icon: ShieldCheck },
  Network: { label: 'Network', icon: Globe },
  MCP: { label: 'MCP', icon: Plug },
  Limit: { label: 'Limit', icon: Gauge },
};

/**
 * A native behavior text longer than this is clamped to one line and gets the More / Less control. A shorter text
 * is never clamped: it wraps, so its full text stays readable at every width (P-43).
 */
const NATIVE_CLAMP_CHARS = 72;

@Component({
  selector: 'ptah-lanes-table-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    NativePopoverComponent,
    PtahButtonDirective,
    PtahDescriptionListComponent,
    PtahDisclosureComponent,
    PtahTableDetailLayoutComponent,
    ClaudeLaneAccountCellComponent,
    CursorCredentialPopoverComponent,
    CliProviderCardPopoversComponent,
    CliCapabilityDetailComponent,
    CopilotAutoApproveToggleComponent,
  ],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './lanes-table-detail.component.css',
  templateUrl: './lanes-table-detail.component.html',
})
export class LanesTableDetailComponent {
  protected readonly icons = {
    provider: Bot,
    account: LogIn,
    executable: Terminal,
    native: ShieldCheck,
    autoApprove: ToggleRight,
    key: KeyRound,
    tiers: Layers,
    test: Play,
    install: BookOpen,
    codex: Settings2,
  } as const;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly popovers = viewChildren(NativePopoverComponent);
  readonly row = input.required<LaneTableRow>();
  readonly openKind = input<CliProviderInfoKind | 'credentials' | null>(null);
  readonly testResult = input('');
  readonly testing = input(false);
  readonly busy = input(false);
  /** A Re-detect runs (any entry, read-backs included): the install guide shows it as pending. */
  readonly detecting = input(false);
  readonly guides = input<
    Readonly<
      Partial<
        Record<
          CliType,
          { readonly command: string | null; readonly note: string }
        >
      >
    >
  >({});
  readonly kindToggled = output<CliProviderInfoKind | 'credentials'>();
  readonly popoverClosed = output<void>();
  readonly redetect = output<string>();
  readonly codexSettings = output<void>();
  readonly tiers = output<LaneTableRow>();
  readonly test = output<void>();

  constructor() {
    // A new row value can come with a row move (install state changed: the
    // table puts installed rows first). The move hides an open native popover.
    effect(() => {
      this.row();
      for (const popover of this.popovers()) popover.reattach();
    });
  }

  protected readonly systemRow = computed((): SystemCliMatrixRow | null => {
    const row = this.row();
    return row.kind === 'system' ? row : null;
  });
  protected readonly instanceRow = computed((): InstanceCliMatrixRow | null => {
    const row = this.row();
    return row.kind === 'instance' ? row : null;
  });
  /** The "All capabilities" disclosure (decision 20); the user toggles it. */
  protected readonly capabilitiesOpen = signal(false);
  protected readonly capabilityFacts = computed(() =>
    cliCapabilityView(this.row().manifest).badges.map((badge) => ({
      key: badge.label,
      label: CAPABILITY_FACTS[badge.label]?.label ?? badge.label,
      icon: CAPABILITY_FACTS[badge.label]?.icon ?? ShieldCheck,
      value: badge.value,
    })),
  );
  protected readonly nativeExpanded = signal(false);
  protected nativeIsLong(text: string): boolean {
    return text.length > NATIVE_CLAMP_CHARS;
  }
  protected isOpen(kind: CliProviderInfoKind | 'credentials'): boolean {
    return this.openKind() === kind;
  }
  protected focusCredentialKey(): void {
    this.element.nativeElement
      .querySelector<HTMLElement>('[data-testid="cursor-credential-key"]')
      ?.focus();
  }
}
