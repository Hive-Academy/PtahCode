import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  untracked,
} from '@angular/core';
import { ClaudeRpcService } from '@ptah-extension/core';
import { skillDocumentSlug } from '@ptah-extension/shared';
import type { StackSummaryItem } from '@ptah-extension/shared';
import {
  SkillDraftPreviewComponent,
  type SkillDraftMode,
  type SkillDraftSubmission,
  type SkillDraftValue,
} from '../proposal/skill-draft-preview.component';

@Component({
  selector: 'ptah-project-skill-draft',
  standalone: true,
  imports: [SkillDraftPreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (createdPath(); as path) {
      <p role="status">Created: {{ path }}</p>
    } @else {
      <ptah-skill-draft-preview
        [draft]="draft()"
        [mode]="mode()"
        [busy]="busy()"
        [createError]="error()"
        [showCancel]="false"
        (draftChange)="updateDraft($event)"
        (modeChange)="mode.set($event)"
        (createRequested)="create($event)"
      />
    }
  `,
})
export class ProjectSkillDraftComponent {
  private readonly rpc = inject(ClaudeRpcService);
  public readonly item = input.required<StackSummaryItem>();
  private readonly itemKey = computed(() => `${this.item().kind}:${this.item().name}`);
  protected readonly draft = linkedSignal({
    source: this.itemKey,
    computation: (): SkillDraftValue => {
      const item = untracked(this.item);
      return {
        name: skillDocumentSlug(item.name),
        description: `Project guidance for ${item.name}`,
        body: `## Project evidence\n\n- ${item.name}: ${item.evidence}\n\n`,
      };
    },
  });
  protected readonly mode = linkedSignal({
    source: this.itemKey,
    computation: (): SkillDraftMode => 'edit',
  });
  protected readonly busy = linkedSignal({ source: this.itemKey, computation: () => false });
  protected readonly error = linkedSignal({
    source: this.itemKey,
    computation: (): string | null => null,
  });
  protected readonly createdPath = linkedSignal({
    source: this.itemKey,
    computation: (): string | null => null,
  });

  protected updateDraft(patch: Partial<SkillDraftValue>): void {
    if (this.busy()) return;
    this.draft.update((draft) => ({ ...draft, ...patch }));
  }

  protected async create(submitted: SkillDraftSubmission): Promise<void> {
    if (this.busy() || this.createdPath()) return;
    const draft = this.draft();
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await this.rpc.call('harness:create-skill', {
        name: submitted.name,
        description: submitted.description,
        content: submitted.body,
      });
      if (this.draft() !== draft) return;
      if (!response.isSuccess()) {
        this.error.set('Could not create this skill. Your draft is still here.');
        return;
      }
      this.createdPath.set(
        response.data.skillPath ||
          `~/.ptah/plugins/ptah-harness-${submitted.slug}/skills/${submitted.slug}/SKILL.md`,
      );
    } catch {
      if (this.draft() === draft) {
        this.error.set('Could not create this skill. Your draft is still here.');
      }
    } finally {
      if (this.draft() === draft) this.busy.set(false);
    }
  }
}
