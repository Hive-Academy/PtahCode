import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Globe, LucideAngularModule } from 'lucide-angular';
import { PtahButtonDirective, PtahCheckboxDirective, PtahInlineConfirmComponent, PtahStatusComponent } from '@ptah-extension/ui';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { WebSearchKeyEditorComponent } from './web-search-key-editor.component';

export type ProviderId = 'tavily' | 'serper' | 'exa';
export interface ProviderOption {
  value: ProviderId;
  label: string;
  /** What the provider is; shown in the row's tooltip and to screen readers, not as a visible line. */
  summary: string;
  /** The one visible line under the name (pattern map ?3.2: a row stays within ~48 px). */
  freeTier: string;
  signupUrl: string;
}
export interface ProviderTestResult {
  provider: string;
  success: boolean;
  error?: string;
}

@Component({
  selector: 'ptah-web-search-provider-rows',
  standalone: true,
  imports: [SettingsBusyDisabledDirective, LucideAngularModule, PtahButtonDirective, PtahCheckboxDirective, PtahInlineConfirmComponent, PtahStatusComponent, WebSearchKeyEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
            <div
              class="flex flex-col gap-[var(--ptah-gap-field)]"
              role="list"
              aria-label="Web search providers"
            >
              @for (opt of options(); track opt.value) {
                <div
                  role="listitem"
                  class="border-b border-base-content/10 py-[var(--ptah-gap-field)]"
                >
                  <div
                    class="flex flex-nowrap items-center gap-[var(--ptah-gap-controls)]"
                  >
                    <input
                      type="checkbox"
                      ptahCheckbox
                      size="xs"
                      [checked]="selectedProviders().has(opt.value)"
                      [ptahBusyDisabled]="saving()"
                      (change)="providerChange.emit({ provider: opt.value, event: $event })"
                      [attr.data-testid]="
                        'settings-toggle-web-search-provider-' + opt.value
                      "
                      [attr.aria-label]="'Use ' + opt.label + ' for web search'"
                    />
                    <lucide-angular
                      [img]="GlobeIcon"
                      class="w-4 h-4 text-secondary"
                      aria-hidden="true"
                    />
                    <div
                      class="min-w-0 flex-1"
                      [attr.title]="opt.summary + ' ' + opt.freeTier"
                    >
                      <div class="font-bold text-base-content">
                        {{ opt.label
                        }}<span class="sr-only">: {{ opt.summary }}</span>
                      </div>
                      <p class="text-xs text-base-content-muted">
                        {{ opt.freeTier }}
                        <a
                          [href]="opt.signupUrl"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="link underline text-base-content"
                          [attr.data-testid]="
                            'settings-web-search-signup-' + opt.value
                          "
                          >Get API key</a
                        >
                      </p>
                    </div>
                    <span
                      [attr.data-testid]="
                        'settings-web-search-key-status-' + opt.value
                      "
                    >
                      <ptah-status
                        [status]="
                          apiKeyConfigured()[opt.value] ? 'online' : 'offline'
                        "
                        [label]="
                          apiKeyConfigured()[opt.value] ? 'Key set' : 'No key'
                        "
                      />
                    </span>
                    <span
                      [attr.data-testid]="
                        'settings-web-search-status-' + opt.value
                      "
                    >
                      @if (testResults().find(r => r.provider === opt.value); as r) {
                        <ptah-status
                          [status]="r.success ? 'online' : 'failed'"
                          [label]="r.success ? 'Works' : TEST_FAILED"
                        />
                      } @else {
                        <span class="sr-only">Not tested</span>
                      }
                    </span>
                    <div
                      class="flex shrink-0 flex-nowrap items-center gap-[var(--ptah-gap-controls)]"
                    >
                      <ptah-web-search-key-editor
                        [opt]="opt"
                        [configured]="apiKeyConfigured()[opt.value]"
                        [isOpen]="activeKeyProvider() === opt.value"
                        [apiKeyInput]="apiKeyInput()"
                        [keyVisible]="keyVisible()"
                        [saving]="saving()"
                        (editorOpened)="openKeyEditor.emit(opt.value)"
                        (editorClosed)="closeKeyEditor.emit()"
                        (keyInput)="apiKeyChanged.emit($event)"
                        (visibilityToggle)="keyVisibilityToggle.emit()"
                        (save)="saveApiKey.emit()"
                      />
                      @if (apiKeyConfigured()[opt.value]) {
                        <button
                          type="button"
                          ptahButton
                          size="xs"
                          [disabled]="saving()"
                          (click)="requestClear.emit(opt.value)"
                          [attr.aria-label]="'Clear API key for ' + opt.label"
                          [attr.aria-expanded]="confirmingClear() === opt.value"
                          [attr.data-testid]="
                            'settings-web-search-clear-btn-' + opt.value
                          "
                        >
                          Clear
                        </button>
                      }
                    </div>
                  </div>
                  @if (
                    apiKeyConfigured()[opt.value] &&
                    confirmingClear() === opt.value
                  ) {
                    <ptah-inline-confirm
                      [message]="
                        'Clear the stored ' +
                        opt.label +
                        ' key from this machine?'
                      "
                      [detail]="
                        'Searches through ' +
                        opt.label +
                        ' stop until a key is added.'
                      "
                      [ariaLabel]="'Confirm clear ' + opt.label + ' API key'"
                      confirmLabel="Clear key"
                      tone="danger"
                      [busy]="saving()"
                      [confirmTestId]="
                        'settings-web-search-clear-confirm-' + opt.value
                      "
                      [cancelTestId]="
                        'settings-web-search-clear-cancel-' + opt.value
                      "
                      [attr.data-testid]="
                        'settings-web-search-clear-group-' + opt.value
                      "
                      (confirm)="deleteApiKey.emit(opt.value)"
                      (cancelled)="cancelClear.emit(opt.value)"
                    />
                  }
                </div>
              }
            </div>
  `,
})
export class WebSearchProviderRowsComponent {
  readonly options = input.required<readonly ProviderOption[]>();
  readonly selectedProviders = input.required<ReadonlySet<ProviderId>>();
  readonly apiKeyConfigured = input.required<Record<ProviderId, boolean>>();
  readonly activeKeyProvider = input.required<ProviderId | null>();
  readonly confirmingClear = input.required<ProviderId | null>();
  readonly testResults = input.required<ProviderTestResult[]>();
  readonly saving = input.required<boolean>();
  readonly apiKeyInput = input.required<string>();
  readonly keyVisible = input.required<boolean>();
  readonly providerChange = output<{ provider: ProviderId; event: Event }>();
  readonly openKeyEditor = output<ProviderId>();
  readonly closeKeyEditor = output<void>();
  readonly apiKeyChanged = output<Event>();
  readonly keyVisibilityToggle = output<void>();
  readonly saveApiKey = output<void>();
  readonly requestClear = output<ProviderId>();
  readonly deleteApiKey = output<ProviderId>();
  readonly cancelClear = output<ProviderId>();
  readonly GlobeIcon = Globe;
  readonly TEST_FAILED = 'The connection test failed.';
}
