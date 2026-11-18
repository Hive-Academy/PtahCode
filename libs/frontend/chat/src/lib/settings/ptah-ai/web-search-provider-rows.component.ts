import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { Info, LucideAngularModule, Trash2 } from 'lucide-angular';
import { NativePopoverComponent, PtahButtonDirective, PtahCardGridDirective, PtahCheckboxDirective, PtahIconButtonDirective, PtahInlineConfirmComponent, PtahStatusComponent, PtahSurfaceDirective } from '@ptah-extension/ui';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import { WebSearchKeyEditorComponent } from './web-search-key-editor.component';

export type ProviderId = 'tavily' | 'serper' | 'exa';
export interface ProviderOption {
  value: ProviderId;
  label: string;
  /** Provider summary for the info popover and screen readers. */
  summary: string;
  /** Free-tier detail shown in the info popover. */
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
  imports: [SettingsBusyDisabledDirective, LucideAngularModule, NativePopoverComponent, PtahButtonDirective, PtahCardGridDirective, PtahCheckboxDirective, PtahIconButtonDirective, PtahInlineConfirmComponent, PtahStatusComponent, PtahSurfaceDirective, WebSearchKeyEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div ptahCardGrid variant="tight" class="providers" role="list" aria-label="Web search providers">
      @for (opt of options(); track opt.value) {
        <div ptahSurface padding="none" class="provider rounded-box" role="listitem"
          (keydown.escape)="closeEditorOnEscape($event, opt.value)"
          [attr.data-readiness]="selectedProviders().has(opt.value) ? apiKeyConfigured()[opt.value] ? 'ready' : 'missing' : 'off'">
          <div class="provider-header">
            <input type="checkbox" ptahCheckbox
              [checked]="selectedProviders().has(opt.value)" [ptahBusyDisabled]="saving()"
              (change)="providerChange.emit({ provider: opt.value, event: $event })"
              [attr.data-testid]="'settings-toggle-web-search-provider-' + opt.value"
              [attr.aria-label]="'Use ' + opt.label + ' for web search'" />
            <span class="provider-mark" aria-hidden="true">{{ opt.label.charAt(0) }}</span>
            <div class="min-w-0 flex-1">
              <div class="font-semibold">{{ opt.label }}<span class="sr-only">: {{ opt.summary }}</span></div>
              <ptah-status [attr.data-testid]="'settings-web-search-key-status-' + opt.value"
                [status]="apiKeyConfigured()[opt.value] ? 'online' : 'warning'"
                [label]="apiKeyConfigured()[opt.value] ? 'Key set' : 'No key'" />
            </div>
            <ptah-native-popover [isOpen]="infoProvider() === opt.value" [keepInViewport]="true"
              (closed)="infoProvider.set(null)">
              <button trigger type="button" ptahIconButton size="sm" [label]="'About ' + opt.label"
                (click)="infoProvider.set(infoProvider() === opt.value ? null : opt.value)">
                <lucide-angular [img]="InfoIcon" aria-hidden="true" />
              </button>
              <div content class="provider-info">
                <p>{{ opt.summary }}</p><p>{{ opt.freeTier }}</p>
              </div>
            </ptah-native-popover>
          </div>
          <div class="provider-body">
            <span [attr.data-testid]="'settings-web-search-status-' + opt.value">
              @if (testResults().find(r => r.provider === opt.value); as r) {
                <ptah-status [status]="r.success ? 'online' : 'failed'" [label]="r.success ? 'Works' : TEST_FAILED" />
              } @else { <span class="sr-only">Not tested</span> }
            </span>
            @if (activeKeyProvider() === opt.value) {
              <ptah-web-search-key-editor [opt]="opt" [apiKeyInput]="apiKeyInput()" [keyVisible]="keyVisible()"
                (editorClosed)="closeKeyEditor.emit()" (keyInput)="apiKeyChanged.emit($event)"
                (visibilityToggle)="keyVisibilityToggle.emit()" (save)="saveApiKey.emit()" />
            } @else {
              <p class="text-sm text-base-content-muted">{{ apiKeyConfigured()[opt.value] ? 'Ready to search.' : 'Add a key to use this provider.' }}</p>
            }
          </div>
          <div class="provider-footer">
            <button type="button" ptahButton variant="ghost" size="sm"
              [hidden]="activeKeyProvider() === opt.value" [ptahBusyDisabled]="saving()"
              (click)="openKeyEditor.emit(opt.value)"
              [attr.aria-expanded]="activeKeyProvider() === opt.value"
              [attr.aria-label]="(apiKeyConfigured()[opt.value] ? 'Update' : 'Set') + ' API key for ' + opt.label"
              [attr.data-testid]="'settings-web-search-key-btn-' + opt.value">
              {{ apiKeyConfigured()[opt.value] ? 'Update key' : 'Set key' }}
            </button>
            @if (activeKeyProvider() === opt.value) {
              <button type="button" ptahButton variant="primary" size="sm" [busy]="saving()"
                [disabled]="!apiKeyInput().trim()" (click)="saveApiKey.emit()"
                [attr.aria-label]="'Save API key for ' + opt.label" data-testid="settings-web-search-key-save">Save key</button>
              <button type="button" ptahButton variant="ghost" size="sm" (click)="closeKeyEditor.emit()"
                data-testid="settings-web-search-key-cancel">Cancel</button>
            }
            <a [href]="opt.signupUrl" target="_blank" rel="noopener noreferrer" class="link underline text-base-content text-sm"
              [attr.data-testid]="'settings-web-search-signup-' + opt.value">Get API key</a>
            @if (apiKeyConfigured()[opt.value]) {
              <button type="button" ptahButton variant="ghost" size="sm" class="clear-key"
                [ptahBusyDisabled]="saving()" (click)="requestClear.emit(opt.value)"
                [attr.aria-label]="'Clear API key for ' + opt.label"
                [attr.aria-expanded]="confirmingClear() === opt.value"
                [attr.data-testid]="'settings-web-search-clear-btn-' + opt.value">
                <lucide-angular [img]="TrashIcon" class="size-[var(--ptah-icon-sm)]" aria-hidden="true" />
                <span class="clear-key-text">Clear key</span>
              </button>
            }
          </div>
          @if (apiKeyConfigured()[opt.value] && confirmingClear() === opt.value) {
            <ptah-inline-confirm
              [message]="'Clear the stored ' + opt.label + ' key from this machine?'"
              [detail]="'Searches through ' + opt.label + ' stop until a key is added.'"
              [ariaLabel]="'Confirm clear ' + opt.label + ' API key'"
              confirmLabel="Clear key" tone="danger" [busy]="saving()"
              [confirmTestId]="'settings-web-search-clear-confirm-' + opt.value"
              [cancelTestId]="'settings-web-search-clear-cancel-' + opt.value"
              [attr.data-testid]="'settings-web-search-clear-group-' + opt.value"
              (confirm)="deleteApiKey.emit(opt.value)" (cancelled)="cancelClear.emit(opt.value)" />
          }
        </div>
      }
    </div>
  `,
  styles: `
    /* The settings content column is the container: the window width does not tell how wide it is. */
    :host { display: block; container-type: inline-size; }
    .providers { align-items: stretch; grid-template-columns: minmax(0, 1fr); }
    @container (min-width: 720px) { .providers { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .provider { display: flex; flex-direction: column; min-width: 0; container-type: inline-size; border-inline-start: 3px solid var(--ptah-border-color); }
    .provider[data-readiness='ready'] { border-inline-start-color: var(--ptah-card-tone-success); }
    .provider[data-readiness='missing'] { border-inline-start-color: var(--ptah-card-tone-warning); }
    .provider-header { display: flex; align-items: center; gap: var(--ptah-gap-controls); padding: var(--ptah-card-padding-sm); }
    .provider-mark { display: grid; place-items: center; flex-shrink: 0; width: 2.25rem; height: 2.25rem; border: 1px solid var(--ptah-border-color); border-radius: var(--ptah-radius-control); background: var(--ptah-card-bg); font-weight: 600; }
    .provider-body { display: flex; flex-direction: column; gap: var(--ptah-gap-controls); padding: var(--ptah-card-padding-sm); flex: 1; }
    .provider-footer { display: flex; align-items: center; flex-wrap: nowrap; gap: var(--ptah-gap-inline); padding: var(--ptah-card-padding-sm); border-top: 1px solid var(--ptah-border-color); margin-top: auto; }
    .provider-footer [hidden] { display: none; }
    .clear-key { margin-inline-start: auto; }
    .provider-footer a { white-space: nowrap; }
    /* A narrow card keeps one footer line: the clear action shows its icon only (the aria-label stays). */
    @container (max-width: 17rem) { .clear-key-text { display: none; } }
    .provider-info { max-width: 18rem; padding: var(--ptah-card-padding-md); }
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
  readonly InfoIcon = Info;
  readonly TrashIcon = Trash2;
  readonly infoProvider = signal<ProviderId | null>(null);
  readonly TEST_FAILED = 'The connection test failed.';

  /** Escape from any control of the open key editor (field, visibility toggle, Save, Cancel) closes it. */
  closeEditorOnEscape(event: Event, provider: ProviderId): void {
    if (this.activeKeyProvider() !== provider || this.infoProvider() === provider) return;
    event.preventDefault();
    event.stopPropagation();
    this.closeKeyEditor.emit();
  }
}
