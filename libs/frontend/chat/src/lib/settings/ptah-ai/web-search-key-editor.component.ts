import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Eye, EyeOff, Key, LucideAngularModule } from 'lucide-angular';
import { NativePopoverComponent, PtahButtonDirective, PtahFieldComponent, PtahIconButtonDirective, PtahInputDirective } from '@ptah-extension/ui';
import type { ProviderOption } from './web-search-provider-rows.component';

@Component({
  selector: 'ptah-web-search-key-editor',
  standalone: true,
  imports: [NativePopoverComponent, PtahButtonDirective, PtahFieldComponent, PtahIconButtonDirective, PtahInputDirective, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
                      <ptah-native-popover
                        [isOpen]="isOpen()"
                        (closed)="editorClosed.emit()"
                      >
                        <button
                          type="button"
                          trigger
                          ptahButton
                          size="xs"
                          (click)="editorOpened.emit()"
                          [attr.aria-label]="
                            (configured() ? 'Update' : 'Set') +
                            ' API key for ' +
                            opt().label
                          "
                          [attr.data-testid]="
                            'settings-web-search-key-btn-' + opt().value
                          "
                        >
                          <lucide-angular
                            [img]="KeyIcon"
                            class="w-3 h-3"
                            aria-hidden="true"
                          />
                          {{
                            configured()
                              ? 'Update key'
                              : 'Set key'
                          }}
                        </button>
                        <div content class="p-3 w-72 space-y-2 text-left">
                          <ptah-field
                            [label]="'API key for ' + opt().label"
                            [appearance]="
                              configured()
                                ? 'stacked'
                                : 'floating'
                            "
                            size="sm"
                            hint="Stored encrypted on this machine. Use Test connection after saving to check it."
                          >
                            <input
                              [id]="'web-search-api-key-' + opt().value"
                              [type]="keyVisible() ? 'text' : 'password'"
                              ptahInput
                              size="sm"
                              tone="mono"
                              class="w-full pr-9 text-xs"
                              placeholder="Paste the API key"
                              autocomplete="off"
                              spellcheck="false"
                              [value]="apiKeyInput()"
                              (input)="keyInput.emit($event)"
                              (keydown.enter)="save.emit()"
                              data-testid="settings-web-search-key-input"
                            />
                            <span ptahFieldTrailing>
                              <button
                                type="button"
                                ptahIconButton
                                size="xs"
                                (click)="visibilityToggle.emit()"
                                [label]="
                                  keyVisible() ? 'Hide API key' : 'Show API key'
                                "
                                [attr.aria-pressed]="keyVisible()"
                                data-testid="settings-web-search-key-visibility"
                              >
                                <lucide-angular
                                  [img]="keyVisible() ? EyeOffIcon : EyeIcon"
                                  class="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                            </span>
                          </ptah-field>
                          <a
                            [href]="opt().signupUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="link block underline text-base-content text-xs"
                            >Get a key</a
                          >
                          <div class="flex gap-2">
                            <button
                              type="button"
                              ptahButton
                              variant="primary"
                              [busy]="saving()"
                              [disabled]="!apiKeyInput().trim()"
                              (click)="save.emit()"
                              [attr.aria-label]="
                                'Save API key for ' + opt().label
                              "
                              data-testid="settings-web-search-key-save"
                            >
                              Save key
                            </button>
                            <button
                              type="button"
                              ptahButton
                              variant="ghost"
                              (click)="editorClosed.emit()"
                              data-testid="settings-web-search-key-cancel"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </ptah-native-popover>
  `,
})
export class WebSearchKeyEditorComponent {
  readonly opt = input.required<ProviderOption>();
  readonly configured = input.required<boolean>();
  readonly isOpen = input.required<boolean>();
  readonly apiKeyInput = input.required<string>();
  readonly keyVisible = input.required<boolean>();
  readonly saving = input.required<boolean>();
  readonly editorOpened = output<void>();
  readonly editorClosed = output<void>();
  readonly keyInput = output<Event>();
  readonly visibilityToggle = output<void>();
  readonly save = output<void>();
  readonly KeyIcon = Key;
  readonly EyeIcon = Eye;
  readonly EyeOffIcon = EyeOff;
}
