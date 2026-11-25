import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { serializeSkillDocument, validateSkillDocument } from '@ptah-extension/shared';
import {
  PtahButtonDirective,
  PtahCheckboxDirective,
  PtahInputDirective,
  PtahTextareaDirective,
} from '@ptah-extension/ui';

export interface SkillDraftValue {
  name: string;
  description: string;
  body: string;
}

export interface SkillDraftSubmission extends SkillDraftValue {
  slug: string;
}

export function normalizeSkillDraft({ name, description, body }: SkillDraftValue): SkillDraftValue {
  return { name: name.trim(), description: description.trim(), body };
}

export type SkillDraftMode = 'preview' | 'edit';

@Component({
  selector: 'ptah-skill-draft-preview',
  standalone: true,
  imports: [
    FormsModule,
    PtahButtonDirective,
    PtahCheckboxDirective,
    PtahInputDirective,
    PtahTextareaDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="min-w-0 space-y-3 border-t border-[var(--ptah-border-color)] pt-3" aria-label="Skill draft">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="min-w-0 font-semibold [overflow-wrap:anywhere]">
          Skill draft@if (draft().name) { · {{ draft().name }} }
        </h4>
        @if (!generating()) {
          <button
            ptahButton
            variant="outline"
            size="xs"
            type="button"
            [disabled]="busy()"
            (click)="toggleMode()"
          >
            {{ mode() === 'preview' ? 'Edit' : 'Preview' }}
          </button>
        }
      </div>

      @if (generating()) {
        <p role="status" class="text-sm">Generating draft…</p>
      } @else {
        @if (generationError(); as error) {
          <p role="alert" class="text-sm text-state-err">{{ error }}</p>
          @if (canRetryGeneration()) {
            <button
              ptahButton variant="outline" size="xs" type="button"
              [disabled]="busy()" (click)="retryRequested.emit()"
            >
              Try again
            </button>
          }
        }
        @if (mode() === 'edit') {
          <label class="block text-sm">
            Skill name
            <input ptahInput class="w-full" [readOnly]="busy()" [ngModel]="draft().name"
              (ngModelChange)="updateDraft('name', $event)" />
          </label>
          <label class="block text-sm">
            Description
            <input ptahInput class="w-full" [readOnly]="busy()" [ngModel]="draft().description"
              (ngModelChange)="updateDraft('description', $event)" />
          </label>
          <label class="block text-sm">
            Skill content
            <textarea ptahTextarea class="min-h-40 w-full" [readOnly]="busy()" [ngModel]="draft().body"
              (ngModelChange)="updateDraft('body', $event)"></textarea>
          </label>
        } @else {
          <pre
            class="max-h-88 overflow-auto whitespace-pre-wrap rounded-[var(--ptah-radius-surface)]
              bg-[var(--surface-2)] p-3 text-sm"
            tabindex="0"
            role="region"
            aria-label="SKILL.md preview"
            [textContent]="document().content"
          ></pre>
        }

        @if (document().slug; as slug) {
          <p class="text-xs [overflow-wrap:anywhere]">
            Destination
            <code>~/.ptah/plugins/ptah-harness-{{ slug }}/skills/{{ slug }}/SKILL.md</code>
          </p>
        }
        @if (duplicateSlug()) {
          <p role="status" class="text-sm">A skill with this name was created in this run.</p>
          <label class="flex items-center gap-2 text-sm">
            <input ptahCheckbox type="checkbox" [checked]="duplicateConfirmed()" [disabled]="busy()"
              (change)="duplicateConfirmed.set(confirmation.checked)" #confirmation />
            Create with this name anyway
          </label>
        }
        @if (createError(); as error) {
          <p role="alert" class="text-sm text-state-err">{{ error }}</p>
        }
      }

      <div class="flex flex-wrap items-center gap-2">
        @if (!generating()) {
          <button
            ptahButton variant="primary" size="sm" type="button"
            [disabled]="!canCreate()" (click)="submit()"
          >
            {{ busy() ? 'Creating…' : 'Create skill' }}
          </button>
        }
        @if (showCancel()) {
          <button
            ptahButton variant="ghost" size="sm" type="button"
            [disabled]="busy()" (click)="cancelRequested.emit()"
          >
            Cancel
          </button>
        }
      </div>
    </section>
  `,
})
export class SkillDraftPreviewComponent {
  public readonly draft = input.required<SkillDraftValue>();
  public readonly mode = input<SkillDraftMode>('preview');
  public readonly busy = input(false);
  public readonly generating = input(false);
  public readonly generationError = input<string | null>(null);
  public readonly canRetryGeneration = input(false);
  public readonly createError = input<string | null>(null);
  public readonly showCancel = input(true);
  public readonly usedSlugs = input<readonly string[]>([]);

  public readonly draftChange = output<Partial<SkillDraftValue>>();
  public readonly modeChange = output<SkillDraftMode>();
  public readonly createRequested = output<SkillDraftSubmission>();
  public readonly cancelRequested = output<void>();
  public readonly retryRequested = output<void>();

  private readonly normalizedDraft = computed(() => normalizeSkillDraft(this.draft()));
  protected readonly document = computed(() => serializeSkillDocument(this.normalizedDraft()));
  protected readonly duplicateSlug = computed(() => {
    const { slug } = this.document();
    return this.usedSlugs().includes(slug) ? slug : null;
  });
  protected readonly duplicateConfirmed = linkedSignal({
    source: this.duplicateSlug,
    computation: () => false,
  });
  protected readonly canCreate = computed(() =>
    !this.busy() &&
    !this.generating() &&
    validateSkillDocument(this.draft()) &&
    (!this.duplicateSlug() || this.duplicateConfirmed()),
  );

  protected toggleMode(): void {
    if (this.busy() || this.generating()) return;
    this.modeChange.emit(this.mode() === 'preview' ? 'edit' : 'preview');
  }

  protected updateDraft(field: keyof SkillDraftValue, value: string): void {
    if (this.busy() || this.generating()) return;
    this.draftChange.emit({ [field]: value });
  }

  protected submit(): void {
    if (!this.canCreate()) return;
    this.duplicateConfirmed.set(false);
    this.createRequested.emit({ ...this.normalizedDraft(), slug: this.document().slug });
  }
}
