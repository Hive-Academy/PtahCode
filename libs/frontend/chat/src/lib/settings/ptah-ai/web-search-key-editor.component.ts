import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { Eye, EyeOff, LucideAngularModule } from 'lucide-angular';
import { PtahFieldComponent, PtahIconButtonDirective, PtahInputDirective } from '@ptah-extension/ui';
import type { ProviderOption } from './web-search-provider-rows.component';

@Component({
  selector: 'ptah-web-search-key-editor',
  standalone: true,
  imports: [PtahFieldComponent, PtahIconButtonDirective, PtahInputDirective, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ptah-field label="API key" hint="Stored encrypted on this device.">
      <input
        [id]="'web-search-api-key-' + opt().value"
        [type]="keyVisible() ? 'text' : 'password'"
        ptahInput tone="mono" class="w-full"
        [attr.aria-label]="'API key for ' + opt().label"
        placeholder="Paste the API key" autocomplete="off" spellcheck="false"
        [value]="apiKeyInput()" (input)="keyInput.emit($event)"
        (keydown.enter)="save.emit()" (keydown.escape)="closeOnEscape($event)"
        data-testid="settings-web-search-key-input"
      />
      <span ptahFieldTrailing>
        <button type="button" ptahIconButton size="xs"
          (click)="visibilityToggle.emit()"
          [label]="keyVisible() ? 'Hide API key' : 'Show API key'"
          [attr.aria-pressed]="keyVisible()"
          data-testid="settings-web-search-key-visibility">
          <lucide-angular [img]="keyVisible() ? EyeOffIcon : EyeIcon" aria-hidden="true" />
        </button>
      </span>
    </ptah-field>
  `,
})
export class WebSearchKeyEditorComponent {
  readonly opt = input.required<ProviderOption>();
  readonly apiKeyInput = input.required<string>();
  readonly keyVisible = input.required<boolean>();
  readonly editorClosed = output<void>();
  readonly keyInput = output<Event>();
  readonly visibilityToggle = output<void>();
  readonly save = output<void>();
  readonly EyeIcon = Eye;
  readonly EyeOffIcon = EyeOff;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector('input')?.focus());
  }

  closeOnEscape(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.editorClosed.emit();
  }
}
