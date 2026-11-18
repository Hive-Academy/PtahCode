import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { VSCodeService } from '@ptah-extension/core';
import { PtahInstrumentBandComponent } from '@ptah-extension/ui';
import { WebSearchConfigComponent } from './ptah-ai/web-search-config.component';
import { VoiceConfigComponent } from './ptah-ai/voice-config.component';
import { GoVetConsentConfigComponent } from './ptah-ai/go-vet-consent-config.component';
import { SearchVoiceSummaryStore } from './ptah-ai/search-voice-summary.store';

/**
 * Search & Voice tab shell (TASK_2026_555 Advanced / Search & Voice, Batch 39; design system
 * epic TASK_2026_1177_9109).
 *
 * The instrument band shows one segment per section (Web search, Voice, ElevenLabs, go vet); each
 * section reports its own segment to {@link SearchVoiceSummaryStore}. Voice and go vet remain
 * Electron-only, as today.
 */
@Component({
  selector: 'ptah-search-voice-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PtahInstrumentBandComponent,
    WebSearchConfigComponent,
    VoiceConfigComponent,
    GoVetConsentConfigComponent,
  ],
  providers: [SearchVoiceSummaryStore],
  template: `
    <div class="flex flex-col gap-ptah-group" data-testid="search-voice-page">
      <ptah-instrument-band
        [segments]="summary.segments()"
        ariaLabel="Search and voice overview"
        data-testid="search-voice-band"
      />
      <ptah-web-search-config />

      @if (isElectron) {
        <ptah-voice-config />
        <ptah-go-vet-consent-config />
      }
    </div>
  `,
})
export class SearchVoiceSettingsComponent {
  private readonly vscodeService = inject(VSCodeService);
  readonly isElectron = this.vscodeService.isElectron;
  protected readonly summary = inject(SearchVoiceSummaryStore);
}
