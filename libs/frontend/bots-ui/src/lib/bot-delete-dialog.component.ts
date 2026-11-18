import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  viewChildren,
} from '@angular/core';
import type { BotRetention } from '@ptah-extension/shared';
import { NativeModalComponent } from '@ptah-extension/ui';
import { BotsStore } from './bots.store';

export type BotRemovalIntent =
  | { readonly kind: 'archive' }
  | { readonly kind: 'delete'; readonly retention: BotRetention };

@Component({
  selector: 'ptah-bot-delete-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NativeModalComponent],
  template: `<ptah-native-modal
    [isOpen]="isOpen()"
    [ariaLabel]="'Remove “' + name() + '”?'"
    (closed)="cancelled.emit()"
  >
    <h2 modal-header class="text-lg font-semibold">Remove “{{ name() }}”?</h2>
    <p class="my-3">
      Archive hides the bot and keeps everything. You can restore it later.
    </p>
    @if (dirty()) {
      <p>Unsaved changes are lost.</p>
    }
    <div
      role="radiogroup"
      aria-label="Removal method"
      class="grid grid-cols-2 gap-2 my-4"
    >
      @for (option of methods(); track option.value) {
        <button
          #radio
          type="button"
          role="radio"
          [attr.aria-checked]="method() === option.value"
          [tabIndex]="method() === option.value ? 0 : -1"
          [disabled]="disabled()"
          [class]="
            method() === option.value
              ? 'rounded-lg border border-primary p-3 text-left'
              : 'rounded-lg border p-3 text-left'
          "
          (click)="method.set(option.value)"
          (keydown)="navigate($event, 'method', option.value)"
        >
          <strong>{{ option.label }}</strong
          ><span class="block text-xs">{{ option.hint }}</span>
        </button>
      }
    </div>
    @if (method() === 'delete') {
      <h3>What to keep</h3>
      @for (row of rows; track row.key) {
        <div class="my-4">
          <p>{{ row.label }}</p>
          <div
            role="radiogroup"
            [attr.aria-label]="row.label"
            class="inline-flex rounded-full border p-1"
          >
            @for (option of retentionOptions; track option.value) {
              <button
                #radio
                type="button"
                role="radio"
                [attr.aria-checked]="retention()[row.key] === option.value"
                [tabIndex]="retention()[row.key] === option.value ? 0 : -1"
                [disabled]="disabled()"
                [class]="
                  retention()[row.key] === option.value
                    ? 'rounded-full bg-primary text-primary-content px-4 py-1'
                    : 'rounded-full px-4 py-1'
                "
                (click)="setRetention(row.key, option.value)"
                (keydown)="navigate($event, row.key, option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
          <p class="text-xs">{{ row.hint }}</p>
        </div>
      }
      <p class="text-xs">
        Chat sessions stay in your session history in all cases. Kept memory
        stays private to the removed bot.
      </p>
    }
    <div modal-footer class="flex justify-end gap-2 mt-6">
      <button type="button" class="btn btn-ghost" (click)="cancelled.emit()">
        Cancel</button
      ><button
        type="button"
        [class]="method() === 'archive' ? 'btn btn-primary' : 'btn btn-error'"
        [disabled]="disabled()"
        (click)="confirm()"
      >
        {{ method() === 'archive' ? 'Archive bot' : 'Delete bot' }}
      </button>
    </div>
  </ptah-native-modal>`,
})
export class BotDeleteDialogComponent {
  protected readonly store = inject(BotsStore);
  public readonly isOpen = input(false);
  public readonly name = input('bot');
  public readonly archived = input(false);
  public readonly dirty = input(false);
  public readonly confirmed = output<BotRemovalIntent>();
  public readonly cancelled = output<void>();
  protected readonly disabled = computed(() => {
    const reason = this.store.blockedReason();
    return reason !== null && reason !== 'archived';
  });
  private readonly resetSource = computed(() => ({
    open: this.isOpen(),
    name: this.name(),
    archived: this.archived(),
  }));
  protected readonly method = linkedSignal({
    source: this.resetSource,
    computation: ({ archived }): 'archive' | 'delete' =>
      archived ? 'delete' : 'archive',
  });
  protected readonly retention = linkedSignal({
    source: this.resetSource,
    computation: (): BotRetention => ({ memory: 'keep', history: 'keep' }),
  });
  protected readonly methods = computed(() => [
    ...(!this.archived()
      ? [
          {
            value: 'archive' as const,
            label: 'Archive',
            hint: 'Recommended. Keeps memory and run history.',
          },
        ]
      : []),
    {
      value: 'delete' as const,
      label: 'Delete permanently',
      hint: 'Removes the bot. Choose what to keep below.',
    },
  ]);
  protected readonly rows = [
    {
      key: 'memory' as const,
      label: 'Bot memory',
      hint: 'Private memory of this bot. Shared workspace memory is never deleted.',
    },
    {
      key: 'history' as const,
      label: 'Run history',
      hint: 'Records of past runs and the revisions they used. No runs yet.',
    },
  ];
  protected readonly retentionOptions = [
    { value: 'keep' as const, label: 'Keep' },
    { value: 'purge' as const, label: 'Delete' },
  ];
  private readonly radios =
    viewChildren<ElementRef<HTMLButtonElement>>('radio');
  public setRetention(key: keyof BotRetention, value: 'keep' | 'purge'): void {
    if (!this.disabled())
      this.retention.update((current) => ({ ...current, [key]: value }));
  }
  public navigate(
    event: KeyboardEvent,
    group: 'method' | keyof BotRetention,
    current: string,
  ): void {
    if (
      this.disabled() ||
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    const last =
      event.key === 'End' ||
      (event.key !== 'Home' && (current === 'archive' || current === 'keep'));
    if (group === 'method')
      this.method.set(this.archived() || last ? 'delete' : 'archive');
    else this.setRetention(group, last ? 'purge' : 'keep');
    const count = this.methods().length;
    const offset =
      group === 'method' ? 0 : group === 'memory' ? count : count + 2;
    const index = group === 'method' && this.archived() ? 0 : last ? 1 : 0;
    this.radios()[offset + index]?.nativeElement.focus();
  }
  public confirm(): void {
    if (!this.disabled())
      this.confirmed.emit(
        this.method() === 'archive'
          ? { kind: 'archive' }
          : { kind: 'delete', retention: { ...this.retention() } },
      );
  }
}
