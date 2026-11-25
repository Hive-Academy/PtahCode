import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VSCodeService } from '@ptah-extension/core';
import {
  VoiceInputService,
  type VoiceTranscriptionResult,
} from '../../../services/voice-input.service';
import { ComposerVoiceButtonComponent } from './composer-voice-button.component';

function setup(options: { electron?: boolean } = {}) {
  const state = signal<'idle' | 'recording' | 'transcribing'>('idle');
  const error = signal<string | null>(null);
  const elapsed = signal(0);
  let stopResult: VoiceTranscriptionResult | null = null;
  let startError: string | null = null;
  const voice = {
    isRecording: () => state() === 'recording',
    isTranscribing: () => state() === 'transcribing',
    elapsedSeconds: elapsed,
    error,
    startRecording: jest.fn(async () => {
      error.set(startError);
      if (!startError) state.set('recording');
    }),
    stopRecording: jest.fn(async () => {
      state.set('idle');
      return stopResult;
    }),
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: VSCodeService,
        useValue: { isElectron: options.electron ?? true },
      },
      { provide: VoiceInputService, useValue: voice },
    ],
  });
  const fixture = TestBed.createComponent(ComposerVoiceButtonComponent);
  fixture.detectChanges();
  const component = fixture.componentInstance;
  const transcripts: string[] = [];
  const failures: string[] = [];
  component.transcript.subscribe((t) => transcripts.push(t));
  component.failed.subscribe((e) => failures.push(e));
  const button = (): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector('[data-testid="chat-voice-btn"]');
  return {
    fixture,
    component,
    voice,
    state,
    elapsed,
    transcripts,
    failures,
    button,
    setStopResult: (r: VoiceTranscriptionResult | null) => {
      stopResult = r;
    },
    setStartError: (e: string | null) => {
      startError = e;
    },
  };
}

describe('ComposerVoiceButtonComponent', () => {
  it('renders nothing outside Electron', () => {
    const { button } = setup({ electron: false });
    expect(button()).toBeNull();
  });

  it('is a labelled, focusable Dictate button at rest', () => {
    const { button } = setup();
    expect(button()?.getAttribute('aria-label')).toBe('Dictate');
    expect(button()?.getAttribute('title')).toBe('Dictate');
    expect(button()?.disabled).toBe(false);
  });

  it('starts recording, shows the elapsed time, then emits the trimmed transcript', async () => {
    const { component, fixture, voice, elapsed, transcripts, button, setStopResult } =
      setup();
    await component.toggle();
    elapsed.set(65);
    fixture.detectChanges();
    expect(voice.startRecording).toHaveBeenCalled();
    expect(button()?.getAttribute('aria-label')).toBe('Stop recording');
    expect(fixture.nativeElement.textContent).toContain('1:05');

    setStopResult({ ok: true, transcript: '  hello lane  ' });
    await component.toggle();
    expect(voice.stopRecording).toHaveBeenCalled();
    expect(transcripts).toEqual(['hello lane']);
  });

  it('emits failed for a start error and for a failed transcription', async () => {
    const { component, failures, setStartError, setStopResult, state } =
      setup();
    setStartError('Microphone blocked');
    await component.toggle();
    expect(failures).toEqual(['Microphone blocked']);

    setStartError(null);
    state.set('recording');
    setStopResult({ ok: false, error: 'Transcription failed' });
    await component.toggle();
    expect(failures).toEqual(['Microphone blocked', 'Transcription failed']);
  });

  it('is disabled while transcribing and ignores toggles', async () => {
    const { component, fixture, voice, state, button } = setup();
    state.set('transcribing');
    fixture.detectChanges();
    expect(button()?.disabled).toBe(true);
    expect(button()?.getAttribute('aria-label')).toBe('Transcribing...');
    await component.toggle();
    expect(voice.startRecording).not.toHaveBeenCalled();
    expect(voice.stopRecording).not.toHaveBeenCalled();
  });

  it('emits nothing for an empty transcript', async () => {
    const { component, state, transcripts, failures, setStopResult } = setup();
    state.set('recording');
    setStopResult({ ok: true, transcript: '   ' });
    await component.toggle();
    expect(transcripts).toEqual([]);
    expect(failures).toEqual([]);
  });
});
