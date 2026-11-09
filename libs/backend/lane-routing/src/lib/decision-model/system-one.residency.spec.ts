import {
  ollamaPsUrl,
  residentFromPsBody,
  selectRequestBudgetMs,
  SYSTEM_ONE_KEEP_ALIVE,
  SYSTEM_ONE_LOAD_TIMEOUT_MS,
} from './system-one.residency';

describe('decision-model residency', () => {
  it('pins the load budget above the warm inference budget and the keep-alive', () => {
    expect(SYSTEM_ONE_LOAD_TIMEOUT_MS).toBe(60_000);
    expect(SYSTEM_ONE_KEEP_ALIVE).toBe('30m');
  });

  it('uses the load budget only when the probe says the model is not loaded', () => {
    expect(
      selectRequestBudgetMs({ warmMs: 3_000, coldMs: 60_000, resident: false }),
    ).toBe(60_000);
    expect(
      selectRequestBudgetMs({ warmMs: 3_000, coldMs: 60_000, resident: true }),
    ).toBe(3_000);
    expect(
      selectRequestBudgetMs({ warmMs: 3_000, coldMs: 60_000, resident: null }),
    ).toBe(3_000);
    expect(
      selectRequestBudgetMs({ warmMs: 3_000, coldMs: undefined, resident: false }),
    ).toBe(3_000);
    expect(
      selectRequestBudgetMs({ warmMs: 90_000, coldMs: 60_000, resident: false }),
    ).toBe(90_000);
  });

  it('joins the daemon process list and refuses a base that is not a url', () => {
    expect(ollamaPsUrl('http://127.0.0.1:11434')).toBe(
      'http://127.0.0.1:11434/api/ps',
    );
    expect(ollamaPsUrl('http://127.0.0.1:11434/')).toBe(
      'http://127.0.0.1:11434/api/ps',
    );
    expect(ollamaPsUrl('not a url')).toBeNull();
  });

  it('matches an untagged request to the tagged model Ollama reports', () => {
    const body = JSON.stringify({
      models: [{ name: 'nimble:latest', model: 'nimble:latest' }],
    });
    expect(residentFromPsBody(body, 'nimble')).toBe(true);
    expect(residentFromPsBody(body, 'nimble:latest')).toBe(true);
    expect(residentFromPsBody(body, 'tev1')).toBe(false);
    expect(residentFromPsBody(body, 'nimble-mini')).toBe(false);
  });

  it('does not match an untagged request to a loaded non-latest tag', () => {
    const body = JSON.stringify({
      models: [{ name: 'nimble:v1', model: 'nimble:v1' }],
    });
    expect(residentFromPsBody(body, 'nimble')).toBe(false);
    expect(residentFromPsBody(body, 'nimble:v1')).toBe(true);
  });

  it('treats an empty process list as not loaded and a bad body as unknown', () => {
    expect(residentFromPsBody(JSON.stringify({ models: [] }), 'nimble')).toBe(
      false,
    );
    expect(residentFromPsBody('not-json', 'nimble')).toBeNull();
    expect(residentFromPsBody(JSON.stringify({ models: 'nimble' }), 'nimble')).toBe(
      null,
    );
    expect(residentFromPsBody(JSON.stringify({}), 'nimble')).toBeNull();
  });
});
