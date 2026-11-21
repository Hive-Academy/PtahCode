import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { LucideAngularModule, Search, Waypoints, X } from 'lucide-angular';
import type { ProvidersConnection } from '@ptah-extension/core';
import { NativeModalComponent, PtahAlertComponent, PtahButtonDirective, PtahFieldComponent, PtahIconButtonDirective, PtahInputDirective, PtahListRowComponent, PtahSkeletonComponent } from '@ptah-extension/ui';
import { getAnthropicProvider } from '@ptah-extension/shared';
import { connectionAvatarTone, connectionInitials } from './provider-connection-card.state';

const MODALITY: Readonly<Record<string, string>> = {
  apiKey: 'API key', cli: 'CLI login', oauth: 'Sign-in', 'local-native': 'Local server', 'local-proxy': 'Local server', custom: 'Custom endpoint',
};
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';

/**
 * Provider catalog (plan :668-672, design-spec §2.1, prototype `#modalPalette`): a command-palette modal on
 * `NativeModalComponent` (native `<dialog>`: focus trap, Esc and focus return to the opener come from the
 * platform). The search filters the unconfigured catalog; each row offers Connect (→ the unchanged setup
 * wizard for that provider) and, for a sign-in or CLI connection, "Sign in to X". The custom endpoint row
 * opens the wizard with nothing preselected.
 *
 * A failed connections read (which includes `provider:listCustomEntries`) is shown as such, with Retry,
 * never as an empty catalog (Batch 2b carry-forward).
 */
@Component({
  selector: 'ptah-provider-catalog-modal',
  standalone: true,
  imports: [LucideAngularModule, NativeModalComponent, PtahAlertComponent, PtahButtonDirective, PtahFieldComponent, PtahIconButtonDirective, PtahInputDirective, PtahListRowComponent, PtahSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-native-modal [isOpen]="open()" ariaLabelledby="provider-catalog-title" size="md" layout="shell" (closed)="closed.emit()">
      <div modal-header class="flex items-center gap-2" data-testid="provider-catalog-modal">
        <h2 id="provider-catalog-title" class="sr-only">Connect a provider</h2>
        <lucide-angular [img]="SearchIcon" class="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <!-- First focusable control in the dialog: showModal() focuses it (asserted in Gate G RUX-3). -->
        <ptah-field label="Search providers" size="sm" class="flex-1">
        <input ptahInput id="provider-catalog-search" size="sm" type="search" [class]="'w-full text-sm text-base-content ' + focusRing"
          [placeholder]="'Type provider name (' + providers().length + ' in catalog)…'" aria-label="Search providers"
          [value]="query()" (input)="query.set(value($event))" data-testid="provider-catalog-search" />
        </ptah-field>
        <kbd class="kbd kbd-xs" aria-hidden="true">ESC</kbd>
        <!-- After the search in the DOM: the search stays the first focusable control. -->
        <button type="button" ptahIconButton label="Close" (click)="closed.emit()" data-testid="provider-catalog-close">
          <lucide-angular [img]="CloseIcon" class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div class="space-y-3 text-xs" data-testid="provider-catalog-body">
        @switch (status()) {
          @case ('error') {
            <ptah-alert tone="error" [compact]="true" live="assertive" data-testid="provider-catalog-error">
              <p class="text-base-content">Custom providers could not be loaded. Your saved settings have not changed.</p>
              <button alertAction type="button" ptahButton (click)="retryRequested.emit()">Retry</button>
            </ptah-alert>
          }
          @case ('loading') {
            <div aria-busy="true" data-testid="provider-catalog-loading">
              <ptah-skeleton [lines]="2" size="sm" />
            </div>
          }
          @default {
            <span class="block px-2 text-xs font-semibold uppercase tracking-wide text-base-content-muted">
              Available in catalog ({{ providers().length }} unconfigured)
            </span>
            @if (rows().length) {
              <ul aria-label="Providers in the catalog">
                @for (row of rows(); track row.id) {
                  <li [attr.data-provider]="row.id" [attr.title]="row.name + ' — ' + row.detail">
                    <div ptahListRow [title]="row.name" [meta]="row.detail">
                      <span leading [class]="row.avatar" aria-hidden="true">{{ row.initials }}</span>
                      <div trailing class="flex shrink-0 items-center gap-1.5">
                        @if (row.signIn) {
                          <button type="button" ptahButton variant="ghost"
                            [attr.aria-label]="'Sign in to ' + row.name" (click)="signInRequested.emit(row.id)">Sign in</button>
                        }
                        <button type="button" ptahButton [disabled]="!canSetUp()"
                          [attr.aria-label]="'Connect ' + row.name" (click)="providerChosen.emit(row.id)">Connect</button>
                      </div>
                    </div>
                  </li>
                }
              </ul>
            } @else {
              <div class="space-y-2 px-2" data-testid="provider-catalog-empty">
                <p class="text-base-content">No matching providers.</p>
                <button type="button" ptahButton variant="ghost" (click)="query.set('')">Clear search</button>
              </div>
            }
          }
        }

        <div class="border-t border-base-300 px-0 pt-2">
          <div class="flex items-center justify-between gap-2 rounded bg-base-200 p-2.5" data-testid="provider-catalog-custom">
            <div class="flex min-w-0 items-center gap-2">
              <lucide-angular [img]="CustomIcon" class="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div class="min-w-0">
                <span class="block text-sm font-semibold text-base-content">Custom endpoint gateway</span>
                <span class="block text-xs text-base-content-muted">OpenAI- or Anthropic-compatible self-hosted endpoint</span>
              </div>
            </div>
            <button type="button" ptahButton [disabled]="!canSetUp()"
              aria-label="Configure a custom endpoint" (click)="customChosen.emit()">Configure</button>
          </div>
        </div>
      </div>
    </ptah-native-modal>
  `,
})
export class ProviderCatalogModalComponent {
  protected readonly SearchIcon = Search;
  protected readonly CloseIcon = X;
  protected readonly CustomIcon = Waypoints;
  protected readonly focusRing = FOCUS;

  readonly open = input(false);
  /** The unconfigured catalog (the page's `catalog()`), unfiltered. */
  readonly providers = input<readonly ProvidersConnection[]>([]);
  /** The connections read: `error` is shown with Retry, never as an empty list. */
  readonly status = input<'loading' | 'ready' | 'error'>('ready');
  /** Setup can start (settings loaded, nothing saving). */
  readonly canSetUp = input(true);

  readonly closed = output<void>();
  readonly providerChosen = output<string>();
  readonly customChosen = output<void>();
  readonly signInRequested = output<string>();
  readonly retryRequested = output<void>();

  protected readonly query = signal('');
  protected readonly rows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.providers()
      .filter((entry) => !query || entry.name.toLowerCase().includes(query) || entry.id.toLowerCase().includes(query))
      .map((entry) => ({
        id: entry.id, name: entry.name,
        initials: connectionInitials(entry.name),
        avatar: `flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-bold text-base-content ${connectionAvatarTone(entry.id)}`,
        detail: [MODALITY[entry.authMode] ?? entry.authMode, getAnthropicProvider(entry.id)?.description,
          entry.defaultsResolvable ? 'Default models available' : ''].filter(Boolean).join(' · '),
        signIn: entry.authMode === 'oauth' || entry.authMode === 'cli',
      }));
  });

  constructor() {
    // Every opening starts from the full catalog.
    effect(() => { if (this.open()) untracked(() => this.query.set('')); });
  }

  protected value(event: Event): string { return (event.target as HTMLInputElement).value; }
}
