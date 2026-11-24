import {
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
} from '@angular/core';
import { ImagePlus, LucideAngularModule, Paperclip, Plus } from 'lucide-angular';
import { NativePopoverComponent } from '@ptah-extension/ui';
import { COMPOSER_ICON_BUTTON_CLASS } from '@ptah-extension/chat-ui';

/**
 * The composer's attach `+` button and its menu (Attach files, Attach images),
 * lifted from the main chat toolbar so both composers share one control.
 * The owner opens the pickers; this part only says which one was chosen.
 * Never disabled (design-spec 3): an image a lane cannot take is flagged in
 * the tray, not refused here.
 */
@Component({
  selector: 'ptah-composer-attach-menu',
  standalone: true,
  imports: [LucideAngularModule, NativePopoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // No box of its own (like the voice button): the popover is the toolbar's
  // flex item, so no inline line box sits under the 28 px button.
  host: { class: 'contents' },
  template: `
    <ptah-native-popover
      [isOpen]="isOpen()"
      [placement]="'top-start'"
      [hasBackdrop]="true"
      [backdropClass]="'transparent'"
      (closed)="close()"
    >
      <button
        trigger
        [class]="buttonClass"
        [class.bg-surface-2]="isOpen()"
        [class.text-base-content]="isOpen()"
        (click)="toggle()"
        type="button"
        title="Attach"
        aria-label="Attach files or add context"
        aria-haspopup="menu"
        [attr.aria-expanded]="isOpen()"
        data-testid="chat-attach-btn"
      >
        <lucide-angular [img]="PlusIcon" class="w-4 h-4" aria-hidden="true" />
      </button>

      <div
        content
        data-glass-surface="overlay"
        data-composer-overlay
        class="w-44 p-1 flex flex-col"
        role="menu"
      >
        <button
          [class]="itemClass"
          (click)="choose('files')"
          type="button"
          role="menuitem"
          data-testid="composer-attach-files"
        >
          <lucide-angular
            [img]="PaperclipIcon"
            class="w-3.5 h-3.5 text-base-content-muted"
            aria-hidden="true"
          />
          <span>Attach files</span>
        </button>
        <button
          [class]="itemClass"
          (click)="choose('images')"
          type="button"
          role="menuitem"
          data-testid="composer-attach-images"
        >
          <lucide-angular
            [img]="ImagePlusIcon"
            class="w-3.5 h-3.5 text-base-content-muted"
            aria-hidden="true"
          />
          <span>Attach images</span>
        </button>
      </div>
    </ptah-native-popover>
  `,
})
export class ComposerAttachMenuComponent {
  /** The user chose "Attach files"; the menu is already closed. */
  readonly pickFiles = output<void>();
  /** The user chose "Attach images"; the menu is already closed. */
  readonly pickImages = output<void>();

  private readonly _isOpen = signal(false);
  readonly isOpen = this._isOpen.asReadonly();

  protected readonly buttonClass = COMPOSER_ICON_BUTTON_CLASS;
  protected readonly itemClass =
    'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left hover:bg-base-300 focus-visible:bg-base-300 focus-visible:outline-none transition-colors';
  protected readonly PlusIcon = Plus;
  protected readonly PaperclipIcon = Paperclip;
  protected readonly ImagePlusIcon = ImagePlus;

  toggle(): void {
    this._isOpen.update((open) => !open);
  }

  close(): void {
    this._isOpen.set(false);
  }

  protected choose(kind: 'files' | 'images'): void {
    this.close();
    if (kind === 'files') this.pickFiles.emit();
    else this.pickImages.emit();
  }
}
