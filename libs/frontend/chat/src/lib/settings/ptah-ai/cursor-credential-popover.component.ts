import { PtahFieldComponent } from '@ptah-extension/ui';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Eye, EyeOff, LucideAngularModule, X } from 'lucide-angular';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import {
  runDrawerWrite,
  type DrawerWriteOutcome,
} from '../providers/connection-drawer/drawer-write';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahInputDirective,
} from '@ptah-extension/ui';

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content';

/**
 * The Cursor row's Credentials popover (plan :744-749, #64, TASK_2026_551). Cursor runs through the bundled SDK and is
 * detected once a key resolves (`cursor-cli.adapter.ts:208-223`), so this is reachable from the Uninstalled row too.
 * - "Set" badge from `cursorApiKeyStored` (the secrets store only; `cursorApiKeyConfigured` also counts the env var).
 * - With `cursorApiKeyEnvSet`: the 551 note that `CURSOR_API_KEY` takes precedence over the stored key.
 * - Masked key with show/hide (#49); Save → `state.saveCursorCredential(key)`; "Remove stored key" (two-step) →
 *   `saveCursorCredential('')`. Both read back `cursorApiKeyStored`, so a write is reported saved only when the store
 *   says so (D15); the outcome is this popover's own (`runDrawerWrite`), never an earlier save's.
 * - The key lives only in this component's signal, cleared after a save and on destroy (as in the Ptah CLI
 *   instance manager retired in Batch 34).
 * The secret is per machine (secrets store), so there is no Save-to target and no Undo.
 * Gate V 36: a saved key reads "Key stored, not verified." (M4; Ptah has no Cursor check yet, an accepted deviation),
 * and every outcome is reported only through the page toast (M3): a saved key moves the Cursor row between the
 * Uninstalled and installed groups, which re-creates this popover, and the toast outlives it.
 * Re-check 2 (N3): while a write runs the key field is read-only and the buttons are `aria-disabled`, never natively
 * disabled, so focus never drops to `body` and Esc still closes the popover; after a write focus lands on the key field.
 */
@Component({
  selector: 'ptah-cursor-credential-popover',
  standalone: true,
  imports: [
    PtahFieldComponent,
    LucideAngularModule,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahInputDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cursor-credential-popover.component.html',
})
export class CursorCredentialPopoverComponent implements OnDestroy {
  protected readonly CloseIcon = X;
  protected readonly EyeIcon = Eye;
  protected readonly EyeOffIcon = EyeOff;
  protected readonly focusRing = FOCUS;
  private readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private destroyed = false;

  constructor() {
    this.focusAfterRender('cursor-credential-key');
  }

  readonly closed = output<void>();

  /** The typed key: held only here, never in service state. */
  protected readonly key = signal('');
  protected readonly keyVisible = signal(false);
  protected readonly confirmRemove = signal(false);
  protected readonly action = signal<'save' | 'remove' | null>(null);
  protected readonly outcome = signal<DrawerWriteOutcome | null>(null);

  /** `null` while the orchestration read has no data (never guessed from an earlier value). */
  protected readonly stored = computed(
    () => this.state.orchestration().data?.cursorApiKeyStored ?? null,
  );
  protected readonly envSet = computed(
    () => this.state.orchestration().data?.cursorApiKeyEnvSet === true,
  );
  /** Triggers wait while any save runs (D3). */
  protected readonly busy = computed(
    () =>
      this.state.commit().status === 'saving' ||
      this.outcome()?.status === 'saving',
  );

  private readonly outcomeText = computed(() => {
    const outcome = this.outcome(),
      action = this.action();
    if (!outcome || outcome.status === 'saving' || outcome.status === 'idle')
      return null;
    if (outcome.status === 'saved')
      return {
        text:
          action === 'remove'
            ? 'Stored key removed.'
            : 'Key stored, not verified.',
        alert: false,
      };
    const lead =
      outcome.status === 'unconfirmed'
        ? 'Could not confirm the change. Check the "Set" status before retrying.'
        : action === 'remove'
          ? 'The stored key was not removed.'
          : 'The key was not saved.';
    return {
      text: [lead, outcome.message].filter(Boolean).join(' '),
      alert: true,
    };
  });

  ngOnDestroy(): void {
    this.destroyed = true;
    this.key.set('');
  }

  protected onKeyInput(event: Event): void {
    this.key.set((event.target as HTMLInputElement).value);
  }

  protected async save(): Promise<void> {
    const key = this.key();
    if (!key.trim() || this.busy()) return;
    this.action.set('save');
    await runDrawerWrite(
      this.state,
      (context) => this.state.saveCursorCredential(key, context),
      (outcome) => this.outcome.set(outcome),
    );
    this.announce();
    // D15: the typed key is dropped only once the store confirms it; a failed save keeps it for a retry.
    if (this.outcome()?.status === 'saved') {
      this.key.set('');
      this.keyVisible.set(false);
    }
    // N3: focus stays in the popover on the key field (a retry after a failure; a new key after a save).
    this.focusAfterRender('cursor-credential-key');
  }

  /** The confirm replaces "Remove stored key", so focus moves to its Cancel. */
  protected askRemove(): void {
    if (this.busy()) return;
    this.confirmRemove.set(true);
    this.focusAfterRender('cursor-credential-remove-cancel');
  }

  protected cancelRemove(): void {
    if (this.busy()) return;
    this.confirmRemove.set(false);
    this.focusAfterRender('cursor-credential-remove');
  }

  private focusAfterRender(testid: string): void {
    if (this.destroyed) return;
    afterNextRender(
      () =>
        this.element.nativeElement
          .querySelector<HTMLElement>(`[data-testid="${testid}"]`)
          ?.focus(),
      { injector: this.injector },
    );
  }

  /** M3: the outcome goes to the page toast, which outlives this popover (it may be re-created meanwhile). */
  private announce(): void {
    const text = this.outcomeText();
    if (text)
      this.feedback.announce(text.text, text.alert ? 'alert' : 'status');
  }

  protected async remove(): Promise<void> {
    if (this.busy()) return;
    this.action.set('remove');
    await runDrawerWrite(
      this.state,
      (context) => this.state.saveCursorCredential('', context),
      (outcome) => this.outcome.set(outcome),
    );
    this.announce();
    // A failed removal keeps the confirm, with focus on its "Remove key" (only aria-disabled during the write); a
    // removed key closes the confirm, so focus moves to the key field.
    if (this.outcome()?.status === 'saved') {
      this.confirmRemove.set(false);
      this.focusAfterRender('cursor-credential-key');
    }
  }
}
