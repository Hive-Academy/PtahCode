import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import type { StackSummaryItem } from '@ptah-extension/shared';
import { PtahButtonDirective } from '@ptah-extension/ui';
import { ProjectSkillDraftComponent } from '../analyze/project-skill-draft.component';

@Component({
  selector: 'ptah-unmatched-stack-list',
  standalone: true,
  imports: [PtahButtonDirective, ProjectSkillDraftComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unmatched-stack-list.component.html',
})
export class UnmatchedStackListComponent {
  public readonly items = input<StackSummaryItem[]>([]);
  public readonly searching = input(false);
  public readonly searchRequested = output<string>();
}
