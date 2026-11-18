import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from '@angular/core';
import type { VoiceInfoDto, VoiceProviderConfigDto } from '@ptah-extension/shared';
import { PtahButtonDirective, PtahDescriptionItemComponent, PtahDescriptionListComponent,
  PtahFormSectionComponent, PtahStatusComponent } from '@ptah-extension/ui';
import { SearchVoiceSummaryStore } from './search-voice-summary.store';

@Component({
  selector: 'ptah-voice-elevenlabs-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective, PtahDescriptionItemComponent, PtahDescriptionListComponent,
    PtahFormSectionComponent, PtahStatusComponent],
  template: `
    <section id="voice-elevenlabs-heading" tabindex="-1" [attr.aria-labelledby]="section.headingId"
      data-testid="voice-elevenlabs-summary" data-glass-surface="content">
      <ptah-form-section #section heading="ElevenLabs" level="2" wide description="Cloud voices for text to speech.">
        <div aside>
          <ptah-status [status]="hasKey() ? 'completed' : 'pending'" [label]="hasKey() ? 'Key saved' : 'No key'" />
        </div>
        <ptah-description-list>
          <div ptahDescriptionItem term="API key" [value]="hasKey() ? 'Saved' : 'Not set'"></div>
          <div ptahDescriptionItem term="Voice" [value]="voiceLabel()" [mono]="unknownVoice()"></div>
        </ptah-description-list>
        <div footer class="flex flex-wrap gap-ptah-controls">
          <button type="button" ptahButton variant="secondary" data-testid="voice-elevenlabs-manage"
            (click)="details.emit()">{{ hasKey() ? 'Change key' : 'Add key' }}</button>
          <button type="button" ptahButton variant="ghost" data-testid="voice-elevenlabs-details"
            (click)="details.emit()">Voice details</button>
        </div>
      </ptah-form-section>
    </section>
  `,
  styles: `
    :host { display: block; }
    :host-context([data-glass='on']) [data-glass-surface='content'] {
      padding: 0 1.25rem;
    }
  `,
})
export class VoiceElevenlabsSummaryComponent {
  readonly config = input.required<VoiceProviderConfigDto>();
  readonly voices = input<readonly VoiceInfoDto[] | null>(null);
  readonly details = output<void>();
  private readonly summary = inject(SearchVoiceSummaryStore, { optional: true });
  readonly hasKey = computed(() => this.config().elevenlabs.apiKeyConfigured);
  private readonly voiceName = computed(() => this.voices()?.find(voice => voice.id === this.config().elevenlabs.voiceId)?.label);
  readonly voiceLabel = computed(() => this.voiceName() ?? this.config().elevenlabs.voiceId ?? 'No voice chosen');
  readonly unknownVoice = computed(() => !!this.config().elevenlabs.voiceId && !this.voiceName());

  constructor() {
    effect(() => this.summary?.report('elevenlabs', {
      value: this.hasKey() ? 'Key saved' : 'No key',
      meta: this.hasKey() ? `Voice ${this.voiceLabel()}` : 'Add a key for cloud voices',
      tone: this.hasKey() ? 'ok' : 'idle',
    }));
  }
}
