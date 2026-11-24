/**
 * Keyboard map shared by the composer's model and effort menus.
 *
 * Focus stays on the pill while its menu is open (the options are
 * `tabindex="-1"` listbox rows), so the pill and the open panel route their
 * keydown here and act on the answer:
 * - closed: ArrowDown / ArrowUp open the menu;
 * - open: the arrows, Home and End move the active row, Enter or Space
 *   choose it, Escape closes the menu and Tab closes it and lets focus move.
 */
export type ComposerMenuKey = 'open' | 'close' | 'leave' | 'move' | 'choose';

export function composerMenuKey(
  event: KeyboardEvent,
  open: boolean,
): ComposerMenuKey | null {
  if (!open)
    return event.key === 'ArrowDown' || event.key === 'ArrowUp' ? 'open' : null;
  switch (event.key) {
    case 'Escape':
      return 'close';
    case 'Tab':
      return 'leave';
    case 'ArrowDown':
    case 'ArrowUp':
    case 'Home':
    case 'End':
      return 'move';
    case 'Enter':
    case ' ':
      return 'choose';
    default:
      return null;
  }
}
