import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Layers, LucideAngularModule } from 'lucide-angular';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import { PtahInputDirective } from '@ptah-extension/ui';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';

/** Bounds of the max-concurrent field; the runtime enforces the same range (`MAX_CONCURRENT_AGENTS`). */
const MIN_CONCURRENT = 1;
const MAX_CONCURRENT = 100;
/** Orchestration policy lives in the user settings, like the other writes of the Lanes card. */
const SAVE_SCOPE = 'global';

/**
 * The "Max concurrent" control of the Lanes card header: a labelled number input (1-100).
 * It reads `state.orchestration()` and saves on commit with
 * `state.saveSettings({ orchestration: { maxConcurrentAgents } })` through `SettingsSaveFeedbackService`
 * (toast, Undo; the field shows the read-back value).
 */
@Component({
  selector: 'ptah-lanes-max-concurrent',
  standalone: true,
  imports: [LucideAngularModule, PtahInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <label
      for="lanes-max-concurrent"
      class="inline-flex items-center gap-[var(--ptah-gap-label)] text-xs text-base-content-muted"
    >
      <lucide-angular
        [img]="LayersIcon"
        class="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
      <span class="whitespace-nowrap">Max concurrent</span>
      <input
        ptahInput
        size="sm"
        id="lanes-max-concurrent"
        type="number"
        min="1"
        max="100"
        step="1"
        inputmode="numeric"
        class="w-20 font-mono text-xs text-base-content"
        [value]="maxConcurrent() ?? ''"
        [disabled]="maxConcurrent() === null || !canWrite()"
        aria-label="Max concurrent agents (1 to 100)"
        data-testid="policy-max-concurrent-input"
        (change)="saveMaxConcurrent($event)"
      />
    </label>
  `,
})
export class LanesMaxConcurrentComponent {
  protected readonly LayersIcon = Layers;

  private readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  /** The saved value, or `null` before the first read. */
  protected readonly maxConcurrent = computed(
    () => this.state.orchestration().data?.maxConcurrentAgents ?? null,
  );
  /** The input stays enabled while a save runs (disabling it would drop its focus); the save is refused then. */
  protected readonly canWrite = computed(
    () =>
      this.state.scopes().status === 'ready' &&
      this.state.reviewContext() !== null,
  );

  /**
   * Saves on commit (blur / Enter / spinner). A fractional or out-of-range number is clamped to an integer in
   * 1..MAX_CONCURRENT; an empty or non-numeric entry keeps the previous value. The field then shows the read-back value.
   */
  protected async saveMaxConcurrent(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const raw = input.valueAsNumber;
    const previous = this.state.orchestration().data?.maxConcurrentAgents;
    const context = this.state.reviewContext();
    try {
      if (!context || previous === undefined || !Number.isFinite(raw)) return;
      const value = Math.min(
        MAX_CONCURRENT,
        Math.max(MIN_CONCURRENT, Math.round(raw)),
      );
      if (value === previous) return;
      await this.feedback.save({
        label: 'max concurrent agents',
        scope: SAVE_SCOPE,
        write: () =>
          this.state.saveSettings(
            { orchestration: { maxConcurrentAgents: value } },
            context,
          ),
        undo: () =>
          this.state.saveSettings(
            { orchestration: { maxConcurrentAgents: previous } },
            context,
          ),
      });
    } finally {
      // The binding may not change (the same saved value), so the field is set to the read-back value directly.
      const saved = this.state.orchestration().data?.maxConcurrentAgents;
      if (saved !== undefined) input.value = String(saved);
    }
  }
}
