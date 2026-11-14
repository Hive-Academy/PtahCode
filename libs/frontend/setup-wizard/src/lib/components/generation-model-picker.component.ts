import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import { ModelStateService } from '@ptah-extension/core';
import { PtahFieldComponent, PtahFieldControlDirective } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-generation-model-picker',
  standalone: true,
  imports: [PtahFieldComponent, PtahFieldControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[var(--ptah-space-1)]">
      <ptah-field
        label="Model for this tab"
        hint="This is the tab model used by generation and chat."
        appearance="stacked"
        size="md"
      >
        <select
          ptahFieldControl
          [id]="'generation-model-' + tabId()"
          [value]="selectedModel()"
          [disabled]="locked()"
          (change)="choose($event)"
        >
          @for (model of models.availableModels(); track model.id) {
            <option [value]="model.id" [selected]="model.id === selectedModel()">
              {{ model.name }}
            </option>
          }
        </select>
      </ptah-field>
      @if (effectiveProvider() && effectiveProvider() !== 'unknown') {
        <p class="text-xs">Workspace provider: {{ effectiveProvider() }}</p>
      }
      @if (effectiveModel() && effectiveModel() !== 'unknown') {
        <p class="text-xs">Run model: {{ effectiveModel() }}</p>
      }
    </div>
  `,
})
export class GenerationModelPickerComponent {
  protected readonly models = inject(ModelStateService);
  private readonly tabs = inject(TabManagerService);
  readonly tabId = input.required<string>();
  readonly locked = input(false);
  readonly effectiveProvider = input<string | null>(null);
  readonly effectiveModel = input<string | null>(null);
  readonly selectedModel = computed(() => {
    const tab = this.tabs
      .tabs()
      .find((candidate) => candidate.id === this.tabId());
    return tab?.overrideModel ?? this.models.currentModel();
  });
  protected choose(event: Event): void {
    this.tabs.setOverrideModel(
      this.tabId(),
      (event.target as HTMLSelectElement).value,
    );
  }
}
