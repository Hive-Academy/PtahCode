import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VSCodeService } from '@ptah-extension/core';
import { SearchVoiceSummaryStore } from './ptah-ai/search-voice-summary.store';
import { SearchVoiceSettingsComponent } from './search-voice-settings.component';
import { WebSearchConfigComponent } from './ptah-ai/web-search-config.component';
import { VoiceConfigComponent } from './ptah-ai/voice-config.component';
import { GoVetConsentConfigComponent } from './ptah-ai/go-vet-consent-config.component';

@Component({ selector: 'ptah-web-search-config', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush, template: '<p>Web search</p>' })
class WebSearchStub {}

@Component({ selector: 'ptah-voice-config', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush, template: '<p>Voice</p>' })
class VoiceStub {}

@Component({ selector: 'ptah-go-vet-consent-config', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush, template: '<p>Go vet</p>' })
class GoVetStub {}

describe('SearchVoiceSettingsComponent', () => {
  async function render(isElectron: boolean) {
    await TestBed.configureTestingModule({
      imports: [SearchVoiceSettingsComponent],
      providers: [{ provide: VSCodeService, useValue: { isElectron } }],
    }).overrideComponent(SearchVoiceSettingsComponent, {
      remove: { imports: [WebSearchConfigComponent, VoiceConfigComponent, GoVetConsentConfigComponent] },
      add: { imports: [WebSearchStub, VoiceStub, GoVetStub] },
    }).compileComponents();
    const fixture = TestBed.createComponent(SearchVoiceSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => { TestBed.resetTestingModule(); });

  it('mounts web search in VS Code (voice and go vet hidden)', async () => {
    const { element } = await render(false);
    expect(element.querySelector('ptah-web-search-config')).not.toBeNull();
    expect(element.querySelector('ptah-voice-config')).toBeNull();
    expect(element.querySelector('ptah-go-vet-consent-config')).toBeNull();
  });

  it('mounts web search, voice and go vet in Electron', async () => {
    const { element } = await render(true);
    expect(element.querySelector('ptah-web-search-config')).not.toBeNull();
    expect(element.querySelector('ptah-voice-config')).not.toBeNull();
    expect(element.querySelector('ptah-go-vet-consent-config')).not.toBeNull();
  });
  it('shows only reported sections, in page order regardless of report order', async () => {
    const { fixture, element } = await render(true);
    const store = fixture.debugElement.injector.get(SearchVoiceSummaryStore);
    const buttons = () => Array.from(element.querySelectorAll('[data-testid="search-voice-band"] button'))
      .map((button) => button.getAttribute('aria-label'));
    expect(buttons()).toEqual([]);
    store.report('go-vet', { value: 'Off', tone: 'idle' });
    store.report('elevenlabs', { value: 'Key saved', tone: 'ok' });
    fixture.detectChanges();
    expect(buttons()).toEqual(['ElevenLabs Key saved', 'go vet Off']);
    store.report('voice', { value: 'Ready', tone: 'ok' });
    store.report('web-search', { value: '2 of 3 ready', tone: 'warn' });
    fixture.detectChanges();
    expect(buttons()).toEqual(['Web search 2 of 3 ready', 'Voice Ready', 'ElevenLabs Key saved', 'go vet Off']);
    store.clear('go-vet');
    fixture.detectChanges();
    expect(buttons()).toHaveLength(3);
    expect(buttons().join(' ')).not.toContain('go vet');
  });
  it('keeps unavailable Electron sections out of the VS Code band', async () => {
    const { fixture, element } = await render(false);
    fixture.debugElement.injector.get(SearchVoiceSummaryStore)
      .report('web-search', { value: 'Ready', tone: 'ok' });
    fixture.detectChanges();
    const buttons = element.querySelectorAll('[data-testid="search-voice-band"] button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Web search Ready');
  });

});
