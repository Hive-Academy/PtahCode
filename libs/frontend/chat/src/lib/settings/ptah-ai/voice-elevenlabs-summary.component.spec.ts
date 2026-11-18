import { TestBed } from '@angular/core/testing';
import { VoiceElevenlabsSummaryComponent } from './voice-elevenlabs-summary.component';
import { SearchVoiceSummaryStore } from './search-voice-summary.store';
import type { VoiceProviderConfigDto } from '@ptah-extension/shared';

const config: VoiceProviderConfigDto = {
  sttProvider: 'local', ttsProvider: 'elevenlabs',
  local: { whisperModel: 'base.en', modelSource: 'curated', sttDownloaded: true, ttsDownloaded: false, ttsVoice: 'af_heart' },
  elevenlabs: { apiKeyConfigured: true, voiceId: 'voice-id', ttsModelId: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128', sttModelId: 'scribe_v1' },
};

describe('VoiceElevenlabsSummaryComponent', () => {
  function render(key = true) {
    TestBed.configureTestingModule({ imports: [VoiceElevenlabsSummaryComponent], providers: [SearchVoiceSummaryStore] });
    const fixture = TestBed.createComponent(VoiceElevenlabsSummaryComponent);
    fixture.componentRef.setInput('config', { ...config, elevenlabs: { ...config.elevenlabs, apiKeyConfigured: key } });
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('shows saved state without a key value and uses mono for an unknown voice id', () => {
    const fixture = render();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Saved');
    expect(element.textContent).toContain('Change key');
    expect(element.querySelector('[term="Voice"] dd')?.className).toContain('--ptah-font-mono');
    expect(element.textContent).toContain('voice-id');
    expect(TestBed.inject(SearchVoiceSummaryStore).segments()[0]).toMatchObject({ id: 'elevenlabs', value: 'Key saved', meta: 'Voice voice-id', tone: 'ok' });
  });

  it('shows a known voice name and reports changes to the band', () => {
    const fixture = render();
    fixture.componentRef.setInput('voices', [{ id: 'voice-id', label: 'Sarah' }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.voiceLabel()).toBe('Sarah');
    expect(fixture.componentInstance.unknownVoice()).toBe(false);
    expect(TestBed.inject(SearchVoiceSummaryStore).segments()[0].meta).toBe('Voice Sarah');
  });

  it('shows two outline actions in the body and a Clear key action at the end', () => {
    const fixture = render();
    const clear = jest.fn();
    fixture.componentInstance.clearKey.subscribe(clear);
    const element: HTMLElement = fixture.nativeElement;
    for (const id of ['voice-elevenlabs-manage', 'voice-elevenlabs-details']) {
      const button = element.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
      expect(button?.classList).toContain('btn-outline');
      expect(button?.closest('[data-testid="form-section-body"]')).not.toBeNull();
    }
    const clearButton = element.querySelector<HTMLButtonElement>('[data-testid="voice-elevenlabs-clear"]');
    expect(clearButton?.getAttribute('aria-label')).toBe('Clear the ElevenLabs API key');
    clearButton?.click();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('offers key setup and forwards both actions to the TTS drawer', () => {
    const fixture = render(false);
    const details = jest.fn();
    fixture.componentInstance.details.subscribe(details);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Not set');
    expect(element.textContent).toContain('Add key');
    element.querySelectorAll('button').forEach(button => button.click());
    expect(details).toHaveBeenCalledTimes(2);
    expect(element.querySelector('[data-testid="voice-elevenlabs-clear"]')).toBeNull();
    expect(TestBed.inject(SearchVoiceSummaryStore).segments()[0]).toMatchObject({ value: 'No key', meta: 'Add a key for cloud voices', tone: 'idle' });
  });
});
