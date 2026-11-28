import {
  ChangeDetectionStrategy,
  Component,
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
  selector: 'ptah-stack-skill-consent',
  standalone: true,
  imports: [NativeModalComponent, PtahButtonDirective, PtahCheckboxDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stack-skill-consent.component.html',
})
export class StackSkillConsentComponent {
  readonly open = input.required<boolean>();
  readonly previews = input.required<WizardSkillConsentPreview[]>();
  readonly approvedIds = input.required<ReadonlySet<string>>();
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly approve = output<string>();
  readonly install = output<void>();
  readonly cancelRequested = output<void>();
  onClosed(): void {
    if (!this.busy()) this.cancelRequested.emit();
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

