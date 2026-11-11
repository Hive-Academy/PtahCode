import { Directive, inject, TemplateRef } from '@angular/core';
import type { PtahSelectIconContext } from './rich-select.types';

/**
 * The icon of an option, inside `ptah-select`:
 * `<ng-template ptahSelectIcon let-option><lucide-angular [img]="icons[option.icon]" /></ng-template>`.
 * The select renders it in front of each option label and in front of the
 * selected value in the trigger. The template must be decorative: the select
 * marks the icon slot `aria-hidden`.
 */
@Directive({ selector: 'ng-template[ptahSelectIcon]', standalone: true })
export class PtahSelectIconDirective<T = unknown> {
  readonly template = inject<TemplateRef<PtahSelectIconContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _dir: PtahSelectIconDirective<T>,
    ctx: unknown,
  ): ctx is PtahSelectIconContext<T> {
    return true;
  }
}
