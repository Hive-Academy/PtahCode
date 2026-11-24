import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
} from '@angular/core';
import { LucideAngularModule, Mic, Square } from 'lucide-angular';
import { VSCodeService } from '@ptah-extension/core';
import { COMPOSER_ICON_BUTTON_CLASS } from '@ptah-extension/chat-ui';
import { VoiceInputService } from '../../../services/voice-input.service';

const RECORDING_BUTTON_CLASS =
  'inline-flex items-center justify-center h-7 w-7 flex-shrink-0 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(var(--s))] disabled:opacity-50 text-error bg-error/10 animate-pulse';

/**
 * The composer's dictation button (Electron only), lifted from the main chat
 * toolbar. It drives the `VoiceInputService` its host composer provides (one
 * recorder per composer; this part provides none of its own) and hands the
 * owner the transcript to insert, or the error to show.
 */
@Component({
  selector: 'ptah-composer-voice-button',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (isElectron) {
      @if (isRecording()) {
        <span class="text-xs text-error tabular-nums px-0.5">{{
          elapsedLabel()
        }}</span>
      }
      <button
        [class]="buttonClass()"
        [disabled]="isTranscribing()"
        (click)="toggle()"
        [title]="label()"
        [attr.aria-label]="label()"
        type="button"
        data-testid="chat-voice-btn"
      >
        @if (isTranscribing()) {
          <span
            class="loading loading-spinner loading-xs"
            aria-hidden="true"
          ></span>
        } @else if (isRecording()) {
          <lucide-angular
            [img]="SquareIcon"
            class="w-3.5 h-3.5"
            aria-hidden="true"
          />
        } @else {
          <lucide-angular [img]="MicIcon" class="w-4 h-4" aria-hidden="true" />
        }
      </button>
    }
  `,
})
export class ComposerVoiceButtonComponent {
  private readonly voiceInput = inject(VoiceInputService);

  /** A transcript (trimmed, non-empty) for the owner to insert at the caret. */
  readonly transcript = output<string>();
  /** Recording or transcription failed; the owner shows the message. */
  readonly failed = output<string>();

  readonly isElectron = inject(VSCodeService).isElectron;
  readonly isRecording = this.voiceInput.isRecording;
  readonly isTranscribing = this.voiceInput.isTranscribing;

  readonly elapsedLabel = computed(() => {
    const total = this.voiceInput.elapsedSeconds();
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  });

  readonly label = computed(() =>
    this.isRecording()
      ? 'Stop recording'
      : this.isTranscribing()
        ? 'Transcribing...'
        : 'Dictate',
  );

  /** Idle: the toolbar icon button. Recording: error tint and pulse, no hover fill. */
  protected readonly buttonClass = computed(() =>
    this.isRecording() ? RECORDING_BUTTON_CLASS : COMPOSER_ICON_BUTTON_CLASS,
  );

  protected readonly MicIcon = Mic;
  protected readonly SquareIcon = Square;

  async toggle(): Promise<void> {
    if (this.isTranscribing()) return;

    if (this.isRecording()) {
      const result = await this.voiceInput.stopRecording();
      if (!result) return;
      const text = result.transcript?.trim() ?? '';
      if (result.ok && text) {
        this.transcript.emit(text);
      } else if (!result.ok && result.error) {
        this.failed.emit(result.error);
      }
      return;
    }

    await this.voiceInput.startRecording();
    const error = this.voiceInput.error();
    if (error) this.failed.emit(error);
  }
}
