import type { ElementRef } from '@angular/core';

/**
 * Contract between `ptah-field` and the control that it labels. Each control
 * directive (`ptahFieldControl`, `ptahInput`, `ptahTextarea`, `ptahSelect`)
 * provides itself under this token, so the field finds it with one query.
 */
export abstract class PtahFieldControlRef {
  abstract readonly element: ElementRef<HTMLElement>;
  /** `aria-describedby` that the consumer set before the field added its own id. */
  abstract readonly originalDescription: string | null;
  /** The field calls this when its `error` input changes. */
  abstract setFieldInvalid(invalid: boolean): void;
}
