import { Directive, TemplateRef, inject } from '@angular/core';

/** Marks disclosure body content for creation on first open. */
@Directive({
  selector: 'ng-template[ptahDisclosureLazy]',
  standalone: true,
})
export class PtahDisclosureLazyDirective {
  readonly templateRef = inject(TemplateRef);
}
