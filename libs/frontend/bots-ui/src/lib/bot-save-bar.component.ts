import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  PtahButtonDirective,
  PtahFormActionsComponent,
} from '@ptah-extension/ui';

export type BotSaveDisplayState =
  | 'pristine'
  | 'new'
  | 'dirty'
  | 'invalid'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'error';

@Component({
  selector: 'ptah-bot-save-bar',
  standalone: true,
  host: { class: 'block sticky bottom-0 z-10' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective, PtahFormActionsComponent],
  template: `
    <ptah-form-actions sticky [saving]="state() === 'saving'">
      <span
        start
        [attr.role]="state() === 'invalid' ? 'alert' : 'status'"
        [class.text-error]="
          state() === 'invalid' || state() === 'error' || state() === 'conflict'
        "
        >{{ message() }}</span
      >
      <button
        type="button"
        ptahButton
        variant="ghost"
        [disabled]="discardDisabled()"
        (click)="discard.emit()"
      >
        {{ isNew() ? 'Cancel' : 'Discard changes' }}
      </button>
      <button
        type="button"
        ptahButton
        variant="primary"
        [disabled]="saveDisabled()"
        [busy]="state() === 'saving'"
        (click)="save.emit()"
      >
        @if (state() === 'saving') {
          <span
            class="loading loading-spinner loading-xs motion-reduce:animate-none"
            aria-hidden="true"
          ></span>
        }
        {{ isNew() ? 'Create bot' : 'Save' }}
      </button>
    </ptah-form-actions>
  `,
})
export class BotSaveBarComponent {
  public readonly state = input.required<BotSaveDisplayState>();
  public readonly isNew = input(false);
  public readonly revision = input(0);
  public readonly invalidCount = input(0);
  public readonly blocked = input(false);
  public readonly save = output<void>();
  public readonly discard = output<void>();
  protected readonly saveDisabled = computed(
    () =>
      this.blocked() ||
      ['pristine', 'saving', 'saved', 'conflict'].includes(this.state()),
  );
  protected readonly discardDisabled = computed(
    () =>
      this.blocked() ||
      ['pristine', 'saving', 'saved', 'conflict'].includes(this.state()),
  );
  protected readonly message = computed(() => {
    switch (this.state()) {
      case 'pristine':
        return `Revision ${this.revision()} · saved`;
      case 'new':
        return 'Not saved yet';
      case 'dirty':
        return 'Unsaved changes';
      case 'invalid':
        return `Fix ${this.invalidCount()} fields before you save.`;
      case 'saving':
        return 'Saving…';
      case 'saved':
        return `Saved as revision ${this.revision()}.`;
      case 'conflict':
        return 'Not saved: a newer revision exists.';
      case 'error':
        return 'Not saved.';
    }
  });
}
