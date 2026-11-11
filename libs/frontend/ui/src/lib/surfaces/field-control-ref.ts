import type { ElementRef } from '@angular/core';

/**
 * Contract between `ptah-field` and the control that it labels. Each control
 * (`ptahFieldControl`, `ptahInput`, `ptahTextarea`, `ptahSelect`,
 * `ptah-select`) provides itself under this token, so the field finds it with
 * one query.
 */
export abstract class PtahFieldControlRef {
  /** The labelable element: the native control or the combobox trigger. */
  abstract readonly element: ElementRef<HTMLElement>;
  /** `aria-describedby` that the consumer set before the field added its own id. */
  abstract readonly originalDescription: string | null;
  /** The id that the control binds itself. The field uses it for `label[for]`. */
  readonly controlId?: string;
  /** The field calls this when its `error` input changes. */
  abstract setFieldInvalid(invalid: boolean): void;
  /** The field gives the id of its label (a control that is not labelable by `for`). */
  setFieldLabel?(labelId: string): void;
}
