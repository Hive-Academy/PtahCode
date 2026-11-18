import { SearchVoiceSummaryStore } from './search-voice-summary.store';

describe('SearchVoiceSummaryStore', () => {
  it('starts empty and adds only reported sections in page order', () => {
    const store = new SearchVoiceSummaryStore();
    expect(store.segments()).toEqual([]);
    store.report('go-vet', { value: 'Off', tone: 'idle' });
    store.report('voice', { value: 'Ready', tone: 'ok' });
    expect(store.segments().map(({ id }) => id)).toEqual(['voice', 'go-vet']);
    store.report('elevenlabs', { value: 'Key saved', tone: 'ok' });
    store.report('web-search', { value: '2 of 3 ready', tone: 'warn' });
    expect(store.segments().map(({ id, targetId }) => [id, targetId])).toEqual([
      ['web-search', 'web-search-heading'],
      ['voice', 'voice-engines-heading'],
      ['elevenlabs', 'voice-elevenlabs-heading'],
      ['go-vet', 'go-vet-consent-title'],
    ]);
  });

  it('replaces a report without duplicates and drops obsolete metadata', () => {
    const store = new SearchVoiceSummaryStore();
    store.report('go-vet', { value: 'On', meta: 'Runs in this workspace', tone: 'ok' });
    store.report('go-vet', { value: 'Off', tone: 'idle' });
    expect(store.segments()).toEqual([
      { id: 'go-vet', label: 'go vet', targetId: 'go-vet-consent-title', value: 'Off', tone: 'idle' },
    ]);
  });

  it('clears one section and allows it to report again in its original order', () => {
    const store = new SearchVoiceSummaryStore();
    store.report('web-search', { value: 'Ready', tone: 'ok' });
    store.report('voice', { value: 'Ready', tone: 'ok' });
    store.clear('web-search');
    store.clear('go-vet');
    expect(store.segments().map(({ id }) => id)).toEqual(['voice']);
    store.report('web-search', { value: 'Unavailable', tone: 'warn' });
    expect(store.segments().map(({ id }) => id)).toEqual(['web-search', 'voice']);
  });
});
