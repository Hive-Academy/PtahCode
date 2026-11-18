import { Injectable, computed, signal } from '@angular/core';
import type {
  PtahInstrumentBandSegment,
  PtahInstrumentBandTone,
} from '@ptah-extension/ui';

/** One segment of the Search & Voice instrument band, as a child section reports it. */
export interface SearchVoiceSegmentState {
  readonly value: string;
  readonly meta?: string;
  readonly tone: PtahInstrumentBandTone;
}

export type SearchVoiceSegmentId = 'web-search' | 'voice' | 'elevenlabs' | 'go-vet';

interface SegmentDefinition {
  readonly id: SearchVoiceSegmentId;
  readonly label: string;
  /** Id of the section heading that a click on the segment focuses. */
  readonly targetId: string;
}

/** Band order follows the section order of the page. */
const SEGMENTS: readonly SegmentDefinition[] = [
  { id: 'web-search', label: 'Web search', targetId: 'web-search-heading' },
  { id: 'voice', label: 'Voice', targetId: 'voice-engines-heading' },
  { id: 'elevenlabs', label: 'ElevenLabs', targetId: 'voice-elevenlabs-heading' },
  { id: 'go-vet', label: 'go vet', targetId: 'go-vet-consent-title' },
];

/**
 * Page-scoped state of the Search & Voice instrument band. The tab shell provides it; each section
 * reports the state of its own segment, so the band reads the same data that the section shows and
 * no section reads another section's RPCs. A section that is not on the page (voice and go vet are
 * Electron-only, go vet hides when the host does not support it) never reports, so its segment
 * does not show.
 */
@Injectable()
export class SearchVoiceSummaryStore {
  private readonly states = signal<Partial<Record<SearchVoiceSegmentId, SearchVoiceSegmentState>>>({});

  readonly segments = computed<PtahInstrumentBandSegment[]>(() => {
    const states = this.states();
    return SEGMENTS.flatMap((segment) => {
      const state = states[segment.id];
      return state ? [{ ...segment, ...state }] : [];
    });
  });

  /** Sets or replaces the state of one segment. */
  report(id: SearchVoiceSegmentId, state: SearchVoiceSegmentState): void {
    this.states.update((current) => ({ ...current, [id]: state }));
  }

  /** Removes a segment, for example when its section stops rendering. */
  clear(id: SearchVoiceSegmentId): void {
    this.states.update((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }
}
