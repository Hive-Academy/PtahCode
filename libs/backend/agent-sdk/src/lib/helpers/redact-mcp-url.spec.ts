import {
  redactMcpUrl,
  redactMcpOverrideMap,
  redactMcpErrorText,
} from './redact-mcp-url';

describe('redactMcpUrl', () => {
  it('masks api_key and config but keeps host + path', () => {
    const url =
      'https://server.smithery.ai/%40owner/server/mcp?config=eyJ0b2tlbiI6InNlY3JldCJ9&api_key=sk-live-leak&profile=prod';

    const redacted = redactMcpUrl(url);

    expect(redacted).toContain('server.smithery.ai');
    expect(redacted).toContain('/%40owner/server/mcp');
    expect(redacted).not.toContain('sk-live-leak');
    expect(redacted).not.toContain('eyJ0b2tlbiI6InNlY3JldCJ9');
    expect(redacted).toContain('api_key=***redacted***');
    expect(redacted).toContain('config=***redacted***');
    expect(redacted).toContain('profile=***redacted***');
  });

  it('does not leak the raw secret string anywhere in the output', () => {
    const url = 'https://server.smithery.ai/x/mcp?api_key=TOP_SECRET_VALUE';
    expect(redactMcpUrl(url)).not.toContain('TOP_SECRET_VALUE');
  });

  it('leaves non-secret query params and localhost URLs intact', () => {
    const url = 'http://localhost:7654/session/abc-123';
    expect(redactMcpUrl(url)).toBe('http://localhost:7654/session/abc-123');
  });

  it('masks embedded userinfo credentials', () => {
    const redacted = redactMcpUrl('https://user:hunter2@example.com/mcp');
    expect(redacted).not.toContain('hunter2');
    expect(redacted).toContain('example.com/mcp');
  });

  it('masks case-insensitive secret param names', () => {
    const redacted = redactMcpUrl('https://h.example.com/mcp?ApiKey=leak');
    expect(redacted).not.toContain('leak');
  });

  it('strips the query string from unparseable inputs (fail safe)', () => {
    const redacted = redactMcpUrl('not a url?api_key=leak');
    expect(redacted).not.toContain('leak');
    expect(redacted).toContain('***redacted***');
  });

  it('returns empty / non-string inputs unchanged', () => {
    expect(redactMcpUrl('')).toBe('');
    expect(redactMcpUrl(undefined as unknown as string)).toBeUndefined();
  });
});

describe('redactMcpOverrideMap', () => {
  it('redacts each entry url and preserves keys', () => {
    const out = redactMcpOverrideMap({
      smithery_owner_server: {
        url: 'https://server.smithery.ai/x/mcp?api_key=leak&config=ZZ',
      },
      proxy: { url: 'http://localhost:9000' },
    });

    expect(Object.keys(out).sort()).toEqual(['proxy', 'smithery_owner_server']);
    expect(out['smithery_owner_server']).not.toContain('leak');
    expect(out['smithery_owner_server']).not.toContain('config=ZZ');
    expect(out['proxy']).toBe('http://localhost:9000/');
  });

  it('marks entries without a url and tolerates undefined map', () => {
    expect(redactMcpOverrideMap(undefined)).toEqual({});
    expect(redactMcpOverrideMap({ empty: undefined })).toEqual({
      empty: '<no-url>',
    });
  });
});

describe('redactMcpErrorText', () => {
  it('drops the query, fragment and userinfo of every URL in the text', () => {
    const out = redactMcpErrorText(
      'GET https://user:pw-LEAK@srv.example/mcp?api_key=K-LEAK&x=1#frag-LEAK ' +
        'then http://localhost:7654/session/abc failed',
    );

    expect(out).toContain('https://srv.example/mcp?***redacted***');
    expect(out).toContain('http://localhost:7654/session/abc failed');
    expect(out).not.toMatch(/LEAK/);
    expect(out).not.toContain('x=1');
  });

  it('masks credential header values', () => {
    const out = redactMcpErrorText(
      'Authorization: Token abc-LEAK1, X-Api-Key: LEAK2; Cookie: sid=LEAK3',
    );

    expect(out).not.toMatch(/LEAK/);
    expect(out).toContain('Authorization: ***redacted***');
    expect(out).toContain('X-Api-Key: ***redacted***');
  });

  it('masks bearer tokens and credential assignments', () => {
    const out = redactMcpErrorText(
      'upstream said Bearer eyJhbGciOiJIUzI1NiJ9.LEAK and token=ghp_LEAKLEAKLEAKLEAK',
    );

    expect(out).not.toMatch(/LEAK/);
  });

  it('leaves plain error text alone', () => {
    expect(redactMcpErrorText('spawn ENOENT')).toBe('spawn ENOENT');
    expect(redactMcpErrorText('')).toBe('');
  });
});
