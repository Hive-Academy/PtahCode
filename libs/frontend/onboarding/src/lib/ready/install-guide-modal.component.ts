import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { ExternalLink, LucideAngularModule, RefreshCw } from 'lucide-angular';
import { NativeModalComponent, PtahButtonDirective } from '@ptah-extension/ui';
import { CommandCopyRowComponent } from './command-copy-row.component';
import type { ConnectionOption } from './connection-options';

/**
 * "How to install" for one connection option, in the shared native-dialog
 * modal (focus trap, Escape, focus return to the opener). The parent owns
 * `open`; Close, Escape, the backdrop and Re-check all ask it to close.
 */
@Component({
  selector: 'ptah-install-guide-modal',
  standalone: true,
  imports: [
    LucideAngularModule,
    NativeModalComponent,
    PtahButtonDirective,
    CommandCopyRowComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <ptah-native-modal
      [isOpen]="open()"
      [ariaLabelledby]="titleId()"
      size="lg"
      (closed)="closed.emit()"
    >
      <h2 modal-header [id]="titleId()" class="text-lg font-semibold">
        {{ guide().title }}
      </h2>
      <div data-testid="ready-install-block">
        <p class="mt-1 text-sm text-base-content-muted">{{ guide().intro }}</p>
        <div
          role="tablist"
          [attr.aria-label]="guide().tablistLabel"
          class="mt-3 inline-flex flex-wrap gap-1 rounded-full border border-base-300 p-1"
          data-testid="ready-os-tablist"
        >
          @for (tab of guide().tabs; track tab.id; let i = $index) {
            <button
              type="button"
              role="tab"
              class="min-h-8 rounded-full px-3 text-sm"
              [class.bg-base-300]="activeTab() === tab.id"
              [class.font-semibold]="activeTab() === tab.id"
              [id]="idPrefix() + '-tab-' + tab.id"
              [attr.aria-controls]="
                activeTab() === tab.id ? idPrefix() + '-panel-' + tab.id : null
              "
              [attr.aria-selected]="activeTab() === tab.id"
              [attr.tabindex]="activeTab() === tab.id ? 0 : -1"
              (click)="pickedTab.set(tab.id)"
              (keydown)="onTabKey($event, i)"
            >
              {{ tab.label }}
            </button>
          }
        </div>
        <!-- Only the active panel is rendered: a [hidden] panel would still
             show, because the Tailwind grid utility overrides [hidden]. -->
        @for (tab of guide().tabs; track tab.id) {
          @if (activeTab() === tab.id) {
            <div
              role="tabpanel"
              tabindex="0"
              class="mt-3 grid gap-2"
              [id]="idPrefix() + '-panel-' + tab.id"
              [attr.aria-labelledby]="idPrefix() + '-tab-' + tab.id"
              [attr.data-testid]="'ready-os-panel-' + tab.id"
            >
              @for (row of commandsFor(tab.id); track row.id) {
                <p class="text-xs text-base-content-muted">{{ row.label }}</p>
                <ptah-command-copy-row
                  [command]="row.command"
                  [copyLabel]="row.copyLabel"
                />
              }
            </div>
          }
        }
        <p class="mt-4 text-sm text-base-content-muted">
          Still not found after installing? Open a new terminal, and if
          Re-check keeps failing, restart Ptah so it picks up the updated PATH.
        </p>
        <a
          ptahButton
          variant="ghost"
          class="mt-2"
          [href]="guide().docsUrl"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="ready-docs-link"
        >
          {{ guide().docsLabel }}
          <lucide-angular
            [img]="icons.externalLink"
            class="size-4"
            aria-hidden="true"
          />
        </a>
      </div>
      <div
        modal-footer
        class="mt-5 flex flex-wrap justify-end gap-[var(--ptah-gap-controls)]"
      >
        <button
          ptahButton
          variant="ghost"
          type="button"
          data-testid="install-guide-close"
          (click)="closed.emit()"
        >
          Close
        </button>
        <button
          ptahButton
          variant="primary"
          type="button"
          data-testid="install-guide-recheck"
          (click)="recheck.emit()"
        >
          <lucide-angular
            [img]="icons.refresh"
            class="size-4"
            aria-hidden="true"
          />Re-check
        </button>
      </div>
    </ptah-native-modal>
  `,
})
export class InstallGuideModalComponent {
  readonly option = input.required<ConnectionOption>();
  readonly open = input.required<boolean>();
  /** Close, Escape or a backdrop click. */
  readonly closed = output<void>();
  /** Re-check was pressed; the parent closes the dialog and re-reads. */
  readonly recheck = output<void>();

  protected readonly icons = {
    externalLink: ExternalLink,
    refresh: RefreshCw,
  } as const;
  protected readonly guide = computed(() => this.option().install);
  protected readonly idPrefix = computed(() => `install-${this.option().id}`);
  protected readonly titleId = computed(() => `${this.idPrefix()}-title`);
  /** The tab the viewer picked; null shows the first tab. */
  protected readonly pickedTab = signal<string | null>(null);
  protected readonly activeTab = computed(
    () => this.pickedTab() ?? this.guide().tabs[0]?.id ?? null,
  );

  protected commandsFor(tab: string) {
    return this.guide().commands.filter((row) => row.tab === tab);
  }

  protected onTabKey(event: KeyboardEvent, index: number): void {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const tabs = this.guide().tabs;
    const next = (index + tabs.length + step) % tabs.length;
    this.pickedTab.set(tabs[next].id);
    const siblings = (
      event.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    siblings?.[next]?.focus();
  }
}
