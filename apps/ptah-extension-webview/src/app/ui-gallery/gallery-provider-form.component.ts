import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  PtahButtonDirective,
  PtahFieldComponent,
  PtahInputDirective,
  PtahRichSelectComponent,
  PtahSelectIconDirective,
  PtahTextareaDirective,
  PtahToggleDirective,
} from '@ptah-extension/ui';
import { GALLERY_ICON_PATHS, MODEL_OPTIONS, PROVIDER_OPTIONS } from './gallery-form-controls.data';

/** A realistic form for the form controls reference: a provider connection. */
@Component({
  selector: 'ptah-gallery-provider-form',
  standalone: true,
  imports: [
    PtahButtonDirective,
    PtahFieldComponent,
    PtahInputDirective,
    PtahRichSelectComponent,
    PtahSelectIconDirective,
    PtahTextareaDirective,
    PtahToggleDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<form
    data-testid="form-controls-provider-form"
    class="flex max-w-xl flex-col gap-ptah-field rounded-ptah-surface border border-surface-border p-ptah-dialog"
    aria-labelledby="provider-form-title"
    (submit)="$event.preventDefault()"
  >
    <h4 id="provider-form-title" class="text-ptah-section-title">Connect a provider</h4>
    <ptah-field label="Provider" hint="Local providers need no key." required>
      <ptah-select [options]="providers" [(value)]="provider" clearable>
        <ng-template ptahSelectIcon let-option>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path [attr.d]="icons[option.icon ?? 'cloud']" />
          </svg>
        </ng-template>
      </ptah-select>
    </ptah-field>
    <ptah-field label="Base URL" [hint]="local() ? 'The local server address.' : 'Leave empty to use the default address.'">
      <span ptahFieldLeading aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path [attr.d]="icons['link']" /></svg>
      </span>
      <input ptahInput type="url" [value]="local() ? 'http://localhost:11434' : ''" />
    </ptah-field>
    @if (!local()) {
      <ptah-field
        label="API key"
        required
        revealable
        [error]="keyError()"
        hint="The key stays in the system keychain."
      >
        <span ptahFieldLeading aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path [attr.d]="icons['key']" /></svg>
        </span>
        <input ptahInput type="password" autocomplete="off" [value]="apiKey()" (input)="apiKey.set($any($event.target).value)" />
      </ptah-field>
    }
    <ptah-field label="Default model" hint="Type to search. Groups show the tier.">
      <ptah-select [options]="models" [(value)]="model" searchPlaceholder="Search models">
        <ng-template ptahSelectIcon let-option>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path [attr.d]="icons[option.icon ?? 'spark']" />
          </svg>
        </ng-template>
      </ptah-select>
    </ptah-field>
    <ptah-field label="Notes for your team" counter hint="Shown in the provider list.">
      <textarea ptahTextarea rows="3" maxlength="140"></textarea>
    </ptah-field>
    <label class="flex items-center gap-ptah-inline text-ptah-label">
      <input type="checkbox" ptahToggle checked />
      Use for new sessions
    </label>
    <div class="flex justify-end gap-ptah-controls">
      <button type="button" ptahButton variant="ghost">Cancel</button>
      <button type="submit" ptahButton variant="primary">Connect</button>
    </div>
  </form>`,
})
export class GalleryProviderFormComponent {
  protected readonly providers = PROVIDER_OPTIONS;
  protected readonly models = MODEL_OPTIONS;
  protected readonly icons = GALLERY_ICON_PATHS;
  protected readonly provider = signal<string | null>('anthropic');
  protected readonly model = signal<string | null>('sonnet');
  protected readonly apiKey = signal('sk-short');
  protected readonly local = computed(() => this.provider() === 'ollama' || this.provider() === 'lmstudio');
  protected readonly keyError = computed(() =>
    this.apiKey().length > 0 && this.apiKey().length < 20 ? 'The key is too short. Paste the full key.' : null,
  );
}
