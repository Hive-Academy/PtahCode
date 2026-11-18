import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  PtahBadgeDirective,
  PtahFieldComponent,
  PtahRichSelectComponent,
} from '@ptah-extension/ui';
import { BotsStore } from './bots.store';

@Component({
  selector: 'ptah-bot-memory-approval-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahBadgeDirective, PtahFieldComponent, PtahRichSelectComponent],
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
    <section aria-label="Memory">
      <aside>
        <h3>Memory</h3>
        <p>What the bot remembers between sessions.</p>
      </aside>
      <div class="fields">
        <ptah-field label="Memory scope"
          ><ptah-select
            [options]="memoryOptions"
            [value]="draft.definition.memoryScope.kind"
            [disabled]="disabled()"
            (valueChange)="setMemory($event)"
        /></ptah-field>
        @if (draft.definition.memoryScope.kind === 'workspace') {
          <ptah-field label="Memory workspace" [error]="rootError()"
            ><ptah-select
              triggerId="bot-memory-root"
              [options]="rootOptions()"
              [value]="memoryRoot()"
              [disabled]="disabled()"
              [invalid]="!!rootError()"
              (valueChange)="setRoot($event)"
          /></ptah-field>
        }
      </div>
    </section>
    <section aria-label="Approvals">
      <aside>
        <h3>Approvals</h3>
        <p>When the bot must ask you first. Deny wins over allow.</p>
      </aside>
      <ptah-field label="Permission level" hint="Ask is the default."
        ><ptah-select
          [options]="approvalOptions"
          [value]="draft.definition.approvalRules.mode"
          [disabled]="disabled()"
          (valueChange)="setApproval($event)"
      /></ptah-field>
    </section>
    <section aria-label="Triggers">
      <aside>
        <h3>Triggers</h3>
        <p>How a bot starts. Not available yet.</p>
      </aside>
      <div class="fields">
        @for (trigger of triggers; track trigger) {
          <div>
            <span>{{ trigger }}</span
            ><span ptahBadge class="ml-2">Not available yet</span>
          </div>
        }
        <p>Comes in a later update. Bots cannot start yet.</p>
      </div>
    </section>
  }`,
})
export class BotMemoryApprovalSectionComponent {
  protected readonly store = inject(BotsStore);
  protected readonly disabled = computed(
    () =>
      this.store.readonly() ||
      (this.store.blockedReason() !== null &&
        this.store.blockedReason() !== 'conflict'),
  );
  protected readonly memoryOptions = [
    { value: 'private', label: 'Private to this bot' },
    { value: 'workspace', label: 'Workspace memory' },
  ];
  protected readonly approvalOptions = [
    { value: 'ask', label: 'Ask before each change' },
    { value: 'auto', label: 'Allow automatically' },
    { value: 'deny', label: 'Deny' },
  ];
  protected readonly triggers = [
    'Start by hand',
    'Schedule',
    'Message from Slack, Discord or Telegram',
  ];
  protected readonly memoryRoot = computed(() => {
    const memory = this.store.draft()?.definition.memoryScope;
    return memory?.kind === 'workspace' ? memory.workspaceRoot : '';
  });
  protected readonly rootOptions = computed(() =>
    [
      ...new Set(
        [...this.store.workspaceRoots(), this.memoryRoot()].filter(Boolean),
      ),
    ].map((value) => ({ value, label: value })),
  );
  public rootError(): string | null {
    const definition = this.store.draft()?.definition;
    if (!definition || definition.memoryScope.kind !== 'workspace') return null;
    if (
      definition.scope.kind === 'workspace' &&
      definition.memoryScope.workspaceRoot !== definition.scope.workspaceRoot
    )
      return `Use the workspace of this bot: ${definition.scope.workspaceRoot}.`;
    return definition.memoryScope.workspaceRoot.trim()
      ? null
      : 'Pick the workspace for this memory.';
  }
  public setMemory(kind: string | null): void {
    const definition = this.store.draft()?.definition;
    if (!definition || this.disabled()) return;
    if (kind === 'private')
      this.store.patchDraft({ memoryScope: { kind: 'private' } });
    if (kind === 'workspace')
      this.store.patchDraft({
        memoryScope: {
          kind: 'workspace',
          workspaceRoot:
            definition.scope.kind === 'workspace'
              ? definition.scope.workspaceRoot
              : (this.store.workspaceRoots()[0] ?? ''),
        },
      });
  }
  public setRoot(root: string | null): void {
    if (!this.disabled() && root !== null)
      this.store.patchDraft({
        memoryScope: { kind: 'workspace', workspaceRoot: root },
      });
  }
  public setApproval(mode: string | null): void {
    if (
      !this.disabled() &&
      (mode === 'ask' || mode === 'auto' || mode === 'deny')
    )
      this.store.patchDraft({ approvalRules: { mode } });
  }
}
