import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConnectionChoiceStore } from './connection-choice.store';
import { ConnectionOptionHeadingComponent } from './connection-option-heading.component';
import {
  CONNECTION_OPTION_LIST,
  connectionColumns,
  connectionRole,
  isConnectionOptionId,
  type ConnectionRole,
} from './connection-options';
import { PtahButtonDirective, PtahStatePanelComponent } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-connection-choice',
  standalone: true,
  imports: [
    RouterLink,
    ConnectionOptionHeadingComponent,
    PtahButtonDirective,
    PtahStatePanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <fieldset
      class="block"
      [attr.aria-busy]="
        store.saved().kind === 'loading' || store.phase() === 'saving'
      "
    >
      <legend id="connection-choice-label" class="sr-only">
        Main connection
      </legend>
      @if (store.saved().kind === 'other') {
        <p
          id="connection-choice-help"
          class="text-sm text-base-content-muted"
        >
          Your main connection is {{ store.name() }}. The options below are for
          information. Choose one to switch.
        </p>
      }
      @if (store.saved().kind === 'loading') {
        <div
          class="mt-3 gap-[var(--ptah-gap-heading)] grid grid-cols-1 lg:grid-cols-[repeat(var(--connection-cols),minmax(0,1fr))]"
          [style.--connection-cols]="columns"
          role="status"
        >
          <span class="sr-only">Loading your saved connection</span>
          @for (option of options; track option.id) {
            <div class="h-20 animate-pulse rounded-[14px] bg-base-200"></div>
          }
        </div>
      } @else {
        <div
          role="radiogroup"
          aria-labelledby="connection-choice-label"
          [attr.aria-describedby]="
            store.saved().kind === 'other' ? 'connection-choice-help' : null
          "
          class="mt-3 gap-[var(--ptah-gap-heading)] grid grid-cols-1 lg:grid-cols-[repeat(var(--connection-cols),minmax(0,1fr))]"
          [style.--connection-cols]="columns"
          data-testid="connection-choice-cards"
        >
          @for (card of options; track card.id) {
            <label
              class="flex cursor-pointer items-start gap-[var(--ptah-gap-heading)] rounded-[14px] border bg-base-200 px-[var(--ptah-surface-pad)] py-3 focus-within:ring-2 focus-within:ring-base-content focus-within:ring-offset-2"
              [class.border-primary]="selected() === card.id"
              [class.border-base-300]="selected() !== card.id"
              [attr.aria-disabled]="store.phase() === 'saving'"
            >
              <input
                type="radio"
                class="radio radio-primary mt-2"
                name="main-connection"
                [value]="card.id"
                [checked]="selected() === card.id"
                [disabled]="store.phase() === 'saving'"
                (change)="store.choose(card.id)"
              />
              <ptah-connection-option-heading
                [option]="card"
                [connectionRole]="roles()[card.id]"
              />
            </label>
          }
        </div>
      }
    </fieldset>
    @if (store.changed()) {
      <div
        role="group"
        aria-label="Confirm main connection change"
        class="mt-3 rounded-xl border border-primary bg-base-100 p-[var(--ptah-surface-pad)] text-sm"
      >
        <p class="font-semibold">
          Use {{ store.nameForPending() }} as your main connection?
        </p>
        <p>
          This ends running chat sessions
          {{
            store.target() === 'workspace'
              ? 'in this workspace'
              : 'in every workspace'
          }}.
        </p>
        <p class="text-base-content-muted">
          Saved to:
          {{
            store.target() === 'workspace'
              ? 'This workspace'
              : 'Every workspace'
          }}.
        </p>
        @if (!store.canConfirm()) {
          <p role="status">
            Where to save is not loaded yet. You cannot change the connection
            until it loads.
          </p>
        }
        @if (store.phase() === 'saving') {
          <p role="status">Saving your main connection...</p>
        }
        <div class="mt-3 flex gap-[var(--ptah-gap-controls)]">
          <button
            ptahButton
            variant="primary"
            type="button"
            [busy]="!store.canConfirm() || store.phase() === 'saving'"
            (click)="save()"
          >
            {{
              store.phase() === 'saving'
                ? 'Saving...'
                : 'Use ' + store.nameForPending()
            }}
          </button>
          <button ptahButton variant="ghost" type="button" (click)="cancel()">
            Cancel
          </button>
        </div>
      </div>
    }
    @if (store.notice(); as notice) {
      <div
        #noticeElement
        class="mt-3 rounded-xl border border-base-300 px-3.5 py-2.5 text-sm"
        [attr.role]="
          notice === 9 || notice === 10 || notice === 11 || notice === 12
            ? 'alert'
            : null
        "
        [attr.aria-live]="
          notice === 9 || notice === 10 || notice === 11 || notice === 12
            ? null
            : 'polite'
        "
        tabindex="-1"
        data-testid="connection-choice-notice"
      >
        @switch (notice) {
          @case (6) {
            Saved. {{ store.name() }} is your main connection.
          }
          @case (7) {
            Saved. {{ store.name() }} is your main connection. Some settings
            could not be refreshed. Press Re-check to read them again.
          }
          @case (8) {
            Another save is in progress. Try again in a moment.
          }
          @case (9) {
            Not saved. Your main connection is still {{ store.name() }}. You can
            try again.
          }
          @case (10) {
            Ptah could not confirm the change, so it may not be in effect yet.
            Showing the connection that is saved now.
            <a routerLink="/settings/providers" class="link">Open Providers</a>
          }
          @case (11) {
            Saved, status not confirmed. Your change was saved, but Ptah could
            not confirm the saved connection. Nothing is selected until it can.
            <button ptahButton type="button" (click)="retry()">
              Try again
            </button>
            <a routerLink="/settings/providers" class="link">Open Providers</a>
          }
          @case (12) {
            Ptah could not read your saved connection.
            <button ptahButton type="button" (click)="retry()">
              Try again
            </button>
          }
        }
      </div>
    } @else if (store.saved().kind === 'unreadable') {
      <ptah-state-panel
        class="mt-3"
        state="error"
        title="Ptah could not read your saved connection."
        actionLabel="Try again"
        (action)="retry()"
      />
    } @else if (store.saved().kind === 'other') {
      <p class="mt-3 text-sm" aria-live="polite">
        You can manage {{ store.name() }} in Providers.
        <a routerLink="/settings/providers" class="link">Open Providers</a>
      </p>
    }
  `,
})
export class ConnectionChoiceComponent {
  readonly store = inject(ConnectionChoiceStore);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly options = inject(CONNECTION_OPTION_LIST);
  /** One grid column per option, up to three. */
  protected readonly columns = connectionColumns(this.options.length);
  /** The provider of the saved main connection, when it is one of the options. */
  private readonly savedProvider = computed(() => {
    const kind = this.store.saved().kind;
    return isConnectionOptionId(kind) ? kind : null;
  });
  protected readonly selected = computed(
    () => this.store.pending() ?? this.savedProvider(),
  );
  /** Each option's card role, keyed by option id. */
  protected readonly roles = computed(() => {
    const saved = this.savedProvider();
    return Object.fromEntries(
      this.options.map((option) => [option.id, connectionRole(saved, option.id)]),
    ) as Readonly<Record<string, ConnectionRole>>;
  });
  protected async save(): Promise<void> {
    if (!this.store.canConfirm()) return;
    await this.store.confirm();
    this.focusRadioAfterRender();
  }
  protected cancel(): void {
    this.store.cancel();
    this.focusRadioAfterRender();
  }
  protected async retry(): Promise<void> {
    await this.store.retry();
    this.focusRadioAfterRender();
  }
  private focusRadioAfterRender(): void {
    afterNextRender(
      () => {
        const host = this.host.nativeElement;
        (
          host.querySelector<HTMLInputElement>('input[type="radio"]:checked') ??
          host.querySelector<HTMLInputElement>('input[type="radio"]')
        )?.focus();
      },
      { injector: this.injector },
    );
  }
}
