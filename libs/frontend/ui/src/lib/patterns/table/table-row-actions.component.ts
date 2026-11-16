import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  computed,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { PtahIconButtonDirective } from '../../button/icon-button.directive';
import { NativeDropdownComponent } from '../../native/dropdown/native-dropdown.component';

let nextMenuId = 0;

@Component({
  selector: 'ptah-table-row-actions',
  standalone: true,
  imports: [PtahIconButtonDirective, NativeDropdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'ptah-table-row-actions' },
  template: `
    <ng-content select="[ptahInlineAction]" />
    <ptah-native-dropdown
      [isOpen]="open()"
      [panelRole]="null"
      (closed)="close()"
    >
      <button
        #trigger
        trigger
        ptahIconButton
        type="button"
        [label]="accessibleMenuLabel()"
        [attr.aria-haspopup]="'menu'"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? menuId : null"
        (click)="toggle()"
        (keydown.arrowdown)="openAt(0, $event)"
        (keydown.arrowup)="openAt(-1, $event)"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      <div
        content
        role="menu"
        [id]="menuId"
        tabindex="-1"
        #menu
        class="ptah-table-row-actions-menu"
        (keydown)="onMenuKeydown($event)"
        (click)="onMenuClick($event)"
      >
        <ng-content />
      </div>
    </ptah-native-dropdown>
  `,
  styles: [
    `
      .ptah-table-row-actions {
        display: inline-flex;
        align-items: center;
        gap: var(--ptah-gap-inline);
      }
      .ptah-table-row-actions-menu {
        display: flex;
        flex-direction: column;
        min-width: 9rem;
        background: var(--ptah-card-bg-raised);
        border: 1px solid var(--ptah-card-border);
        border-radius: var(--ptah-radius-control);
      }
      .ptah-table-row-actions-menu [role='menuitem'] {
        text-align: start;
        padding: var(--ptah-gap-inline);
      }
      .ptah-table-row-actions-menu [role='menuitem']:focus-visible {
        outline: var(--ptah-focus-ring-width) solid var(--ptah-focus-ring-color);
      }
    `,
  ],
})
export class PtahTableRowActionsComponent implements OnDestroy {
  readonly rowLabel = input.required<string>();
  readonly menuLabel = input<string>();
  readonly open = signal(false);
  readonly menuId = `ptah-table-row-menu-${nextMenuId++}`;
  readonly accessibleMenuLabel = computed(
    () => this.menuLabel() ?? `More actions for ${this.rowLabel()}`,
  );
  private readonly trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
  private focusTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    this.cancelFocus();
  }

  toggle(): void {
    if (this.open()) this.close();
    else this.openAt(0);
  }

  openAt(index: number, event?: Event): void {
    event?.preventDefault();
    this.open.set(true);
    this.cancelFocus();
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      if (this.open()) this.focusItem(index);
    });
  }

  close(returnFocus = true): void {
    this.cancelFocus();
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.trigger().nativeElement.focus();
  }

  onMenuKeydown(event: KeyboardEvent): void {
    const items = this.items();
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'Tab':
        // Focus continues in normal tab order; the menu only closes.
        this.close(false);
        break;
      case 'Home':
        event.preventDefault();
        this.focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusItem(items.length - 1);
        break;
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const active = this.menu()?.nativeElement.ownerDocument.activeElement;
        const current =
          active instanceof HTMLElement ? items.indexOf(active) : -1;
        this.focusItem(current + (event.key === 'ArrowDown' ? 1 : -1));
        break;
      }
    }
  }

  onMenuClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('[role="menuitem"]'))
      this.close();
  }

  private cancelFocus(): void {
    if (this.focusTimer !== null) {
      clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }
  }

  private items(): HTMLElement[] {
    const menu = this.menu()?.nativeElement;
    if (!menu) return [];
    return Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
    );
  }

  private focusItem(index: number): void {
    const items = this.items();
    if (items.length) items[(index + items.length) % items.length].focus();
  }
}
