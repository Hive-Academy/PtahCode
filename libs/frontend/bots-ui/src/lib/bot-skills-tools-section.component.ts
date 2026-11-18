import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { InstalledSkill } from '@ptah-extension/shared';
import { BotsStore } from './bots.store';
import { BotSkillsPickerComponent } from './bot-skills-picker.component';
import { ToolIdChipInputComponent } from './tool-id-chip-input.component';

@Component({
  selector: 'ptah-bot-skills-tools-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotSkillsPickerComponent, ToolIdChipInputComponent],
  styles: [
    `
      section {
        display: grid;
        grid-template-columns: minmax(130px, 1fr) minmax(0, 3fr);
        gap: 24px;
        padding: 24px 0;
        border-bottom: 1px solid var(--border);
      }
      aside p {
        font-size: 12px;
        color: var(--bcm);
      }
      .fields {
        display: grid;
        gap: 16px;
      }
      @media (max-width: 640px) {
        section {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  template: `@if (store.draft(); as draft) {
    <section aria-label="Skills">
      <aside>
        <h3>Skills</h3>
        <p>Installed skills the bot loads.</p>
      </aside>
      <ptah-bot-skills-picker
        [skills]="draft.definition.skills"
        [installedSkills]="installedSkills()"
        [readonly]="disabled()"
        (skillsChange)="store.patchDraft({ skills: $event })"
      />
    </section>
    <section aria-label="Tools">
      <aside>
        <h3>Tools</h3>
        <p>Tools the bot needs. Deny wins over allow.</p>
      </aside>
      <div class="fields">
        <ptah-tool-id-chip-input
          label="Allowed tools"
          [ids]="draft.definition.toolRequirements.allow"
          [overlapIds]="draft.definition.toolRequirements.deny"
          [knownIds]="knownToolIds()"
          [catalogLoaded]="toolsLoaded()"
          [readonly]="disabled()"
          (idsChange)="setTools('allow', $event)"
        />
        <ptah-tool-id-chip-input
          label="Denied tools"
          [ids]="draft.definition.toolRequirements.deny"
          [overlapIds]="draft.definition.toolRequirements.allow"
          [knownIds]="knownToolIds()"
          [catalogLoaded]="toolsLoaded()"
          [readonly]="disabled()"
          (idsChange)="setTools('deny', $event)"
        />
      </div>
    </section>
  }`,
})
export class BotSkillsToolsSectionComponent {
  protected readonly store = inject(BotsStore);
  public readonly installedSkills = input<readonly InstalledSkill[]>([]);
  public readonly knownToolIds = input<readonly string[]>([]);
  public readonly catalogLoaded = input(false);
  public readonly catalogLoading = input(false);
  public readonly catalogFailed = input(false);
  protected readonly toolsLoaded = computed(
    () =>
      this.catalogLoaded() && !this.catalogLoading() && !this.catalogFailed(),
  );
  protected readonly disabled = computed(
    () =>
      this.store.readonly() ||
      (this.store.blockedReason() !== null &&
        this.store.blockedReason() !== 'conflict'),
  );
  public setTools(kind: 'allow' | 'deny', ids: string[]): void {
    const draft = this.store.draft();
    if (draft && !this.disabled())
      this.store.patchDraft({
        toolRequirements: { ...draft.definition.toolRequirements, [kind]: ids },
      });
  }
}
