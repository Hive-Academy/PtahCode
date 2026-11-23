import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { OperatorSettings, RepositorySettings } from '@ptah-extension/review-contracts';
import {
  PtahButtonDirective,
  PtahCheckboxDirective,
  PtahFieldComponent,
  PtahIconButtonDirective,
  PtahInputDirective,
} from '@ptah-extension/ui';
import { GitBranch, LucideAngularModule, Plus, Trash2 } from 'lucide-angular';

/** "Repositories" section of the review settings drawer (design-spec 3.1). Presentational. */
@Component({
  selector: 'ptah-review-repositories-editor',
  standalone: true,
  imports: [
    LucideAngularModule,
    PtahButtonDirective,
    PtahCheckboxDirective,
    PtahFieldComponent,
    PtahIconButtonDirective,
    PtahInputDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="review-repositories-h">
      <div class="flex items-center gap-2">
        <lucide-angular [img]="GitBranchIcon" class="size-4 text-base-content-muted" aria-hidden="true" />
        <h3 id="review-repositories-h" class="text-sm font-semibold">Repositories</h3>
      </div>
      <p class="mt-1 text-xs text-base-content-muted">
        Fork PRs are always excluded. CodeRabbit remains enabled alongside Ptah review.
      </p>
      <div class="mt-3 space-y-3">
        @for (repo of draft().repositories; track repo.owner + '/' + repo.name) {
          <div class="rounded-box border border-base-300 bg-base-200 p-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium break-all">{{ repo.owner }}/{{ repo.name }}</p>
              <button
                type="button"
                ptahIconButton
                variant="ghost"
                size="xs"
                [label]="'Remove ' + repo.owner + '/' + repo.name"
                (click)="removed.emit(repo)"
              >
                <lucide-angular [img]="Trash2Icon" class="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <label class="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                ptahCheckbox
                [checked]="repo.enabled"
                (change)="enabledChanged.emit({ repo, event: $event })"
              />Enable review polling
            </label>
            <label class="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                ptahCheckbox
                [checked]="repo.dryRun"
                [disabled]="repo.dryRun && (!hasToken() || !botConnected())"
                (change)="dryRunChanged.emit({ repo, event: $event })"
              />Keep this repository in dry-run
            </label>
            <label class="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                ptahCheckbox
                [checked]="repo.publicationPaused"
                (change)="pauseChanged.emit({ repo, event: $event })"
              />Pause publication for this repository
            </label>
            @if (!hasToken() || !botConnected()) {
              <p class="mt-2 text-xs text-base-content-muted">Connect a bot token to enable live publication.</p>
            }
          </div>
        } @empty {
          <p class="text-sm text-base-content-muted">No repositories added.</p>
        }
      </div>
      <div class="mt-3 flex items-end gap-2">
        <ptah-field class="min-w-0 flex-1" label="Add repository (owner/name)" appearance="stacked">
          <input
            ptahInput
            id="review-add-repository"
            class="w-full"
            [value]="newRepository()"
            (input)="newRepositoryChanged.emit($event)"
            autocomplete="off"
          />
        </ptah-field>
        <button type="button" ptahButton variant="ghost" size="md" class="shrink-0" (click)="added.emit()">
          <lucide-angular [img]="PlusIcon" class="size-4" aria-hidden="true" />
          Add repository
        </button>
      </div>
      @if (repositoryError()) {
        <p role="alert" class="mt-1 flex items-center gap-1.5 text-xs text-base-content">
          <span class="inline-block size-2 shrink-0 bg-state-err" aria-hidden="true"></span>{{ repositoryError() }}
        </p>
      }
    </section>
  `,
})
export class ReviewRepositoriesEditorComponent {
  protected readonly GitBranchIcon = GitBranch;
  protected readonly PlusIcon = Plus;
  protected readonly Trash2Icon = Trash2;
  readonly draft = input.required<OperatorSettings>();
  readonly hasToken = input(false);
  readonly botConnected = input(false);
  readonly newRepository = input('');
  readonly repositoryError = input<string | null>(null);
  readonly removed = output<RepositorySettings>();
  readonly enabledChanged = output<{ repo: RepositorySettings; event: Event }>();
  readonly dryRunChanged = output<{ repo: RepositorySettings; event: Event }>();
  readonly pauseChanged = output<{ repo: RepositorySettings; event: Event }>();
  readonly newRepositoryChanged = output<Event>();
  readonly added = output<void>();
}
