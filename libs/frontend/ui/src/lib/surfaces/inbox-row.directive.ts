import { Directive, computed, input } from '@angular/core';

/**
 * Tailwind extracts utility classes from complete literals only, so the three
 * state class strings stay static and the host binds the joined result.
 */
const LIST_ROW_BASE_CLASSES =
  'block w-full min-h-10 rounded-lg px-3 py-2.5 text-left border-l-2 ' +
  'hover:bg-[var(--surface-2)] focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-primary';
const LIST_ROW_SELECTED_CLASSES = 'bg-[var(--surface-2)] border-[var(--ptah-gold)]';
const LIST_ROW_UNSELECTED_CLASSES = 'border-transparent';

/**
 * A selectable row button for a `role="listbox"` parent such as the
 * `ptah-inbox-layout` list pane (TASK_2026_913 context.md; approved
 * TASK_2026_UX_REVIEWS_MACHINES option A). The consumer supplies the listbox;
 * the directive owns the option semantics: `role`, `aria-selected`, the focus
 * ring and the 2 px gold active line. Unselected keeps `border-l-2` with a
 * transparent color so the label does not shift when a row is selected.
 */
@Directive({
  selector: 'button[ptahInboxRow]',
  standalone: true,
  host: {
    type: 'button',
    role: 'option',
    '[attr.aria-selected]': 'ariaSelected()',
    '[class]': 'rowClasses()',
  },
})
export class InboxRowDirective {
  /** Whether this row is the selected option of its listbox. */
  readonly selected = input(false);

  /** role="option" always exposes the state, so screen readers announce "not selected" too. */
  protected readonly ariaSelected = computed(() => (this.selected() ? 'true' : 'false'));
  protected readonly rowClasses = computed(() =>
    this.selected()
      ? `${LIST_ROW_BASE_CLASSES} ${LIST_ROW_SELECTED_CLASSES}`
      : `${LIST_ROW_BASE_CLASSES} ${LIST_ROW_UNSELECTED_CLASSES}`,
  );
}
