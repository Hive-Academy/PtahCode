import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import type { WizardSkillConsentPreview } from '@ptah-extension/shared';
import {
  NativeModalComponent,
  PtahButtonDirective,
  PtahCheckboxDirective,
} from '@ptah-extension/ui';

@Component({
  selector: 'ptah-team-builder-skill-consent',
  standalone: true,
  imports: [NativeModalComponent, PtahButtonDirective, PtahCheckboxDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team-builder-skill-consent.component.html',
})
export class TeamBuilderSkillConsentComponent {
  private readonly element = inject(ElementRef<HTMLElement>);
  readonly open = input.required<boolean>();
  readonly previews = input.required<WizardSkillConsentPreview[]>();
  readonly approvedIds = input.required<ReadonlySet<string>>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly approve = output<string>();
  readonly install = output<void>();
  readonly cancelRequested = output<void>();
  onClosed(): void {
    if (!this.busy()) {
      this.cancelRequested.emit();
      return;
    }
    queueMicrotask(() => {
      const dialog = this.element.nativeElement.querySelector('dialog');
      if (this.busy() && this.open() && dialog && !dialog.open) dialog.showModal();
    });
  }
  allApproved(): boolean {
    return (
      this.previews().length > 0 &&
      this.previews().every(
        (item) => !item.hasScripts || this.approvedIds().has(item.skillName),
      )
    );
  }
}
