import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClaudeRpcService } from '@ptah-extension/core';
import type { StackSummaryItem } from '@ptah-extension/shared';

@Component({
  selector: 'ptah-project-skill-draft',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-lg border border-base-300 p-3 space-y-2" aria-label="Project skill draft">
      <h3 class="font-semibold">Create a project skill for {{ item().name }}</h3>
      <p class="break-all text-xs">Destination: ~/.ptah/plugins/ptah-harness-{{ slug() }}/skills/{{ slug() }}/SKILL.md. Ptah syncs the skill into the workspace.</p>
      <label class="block">Skill name <input class="input input-bordered w-full" [ngModel]="name()" (ngModelChange)="name.set($event)" /></label>
      <label class="block">Description <input class="input input-bordered w-full" [ngModel]="description()" (ngModelChange)="description.set($event)" /></label>
      <label class="block">Skill content <textarea class="textarea textarea-bordered min-h-40 w-full" [ngModel]="content()" (ngModelChange)="content.set($event)"></textarea></label>
      @if (error()) { <p role="alert" class="text-state-err">{{ error() }}</p> }
      @if (createdPath()) { <p role="status">Created: {{ createdPath() }}</p> }
      <button type="button" class="btn btn-primary" [disabled]="busy() || !slug() || !content().trim()" (click)="create()">{{ busy() ? 'Creating…' : 'Create skill' }}</button>
    </section>
  `,
})
export class ProjectSkillDraftComponent {
  private readonly rpc = inject(ClaudeRpcService);
  readonly item = input.required<StackSummaryItem>();
  private readonly itemKey = computed(() => `${this.item().kind}:${this.item().name}`);
  readonly name = signal('');
  readonly slug = computed(() => this.name().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
  readonly description = signal('');
  readonly content = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly createdPath = signal<string | null>(null);
  private revision = 0;

  constructor() {
    effect(() => {
      this.itemKey();
      const item = untracked(() => this.item());
      this.revision++;
      this.name.set(item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
      this.description.set(`Project guidance for ${item.name}`);
      this.content.set(`# ${item.name}\n\n## Verified project evidence\n\n${item.evidence}\n\n## Guidance\n\nDescribe how to work with ${item.name} in this project.`);
      this.error.set(null);
      this.createdPath.set(null);
    });
  }

  async create(): Promise<void> {
    if (this.busy() || !this.slug() || !this.content().trim()) return;
    const revision = this.revision;
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await this.rpc.call('harness:create-skill', {
        name: this.name().trim(), description: this.description().trim(), content: this.content(),
      });
      if (revision !== this.revision) return;
      if (!response.isSuccess()) throw new Error('Create failed');
      this.createdPath.set(response.data.skillPath);
    } catch {
      if (revision === this.revision) this.error.set('Could not create this skill. Your draft is still here.');
    } finally { if (revision === this.revision) this.busy.set(false); }
  }
}
