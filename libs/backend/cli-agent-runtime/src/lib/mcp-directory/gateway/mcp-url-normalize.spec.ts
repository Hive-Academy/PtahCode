import { normalizeMcpUrl } from './mcp-url-normalize';

describe('normalizeMcpUrl', () => {
  it('lowercases the scheme and host and keeps the path case', () => {
    expect(normalizeMcpUrl('HTTPS://MCP.Zernio.COM/Mcp')).toBe(
      'https://mcp.zernio.com/Mcp',
    );
  });

  it('drops the default port for each scheme', () => {
    expect(normalizeMcpUrl('https://example.com:443/mcp')).toBe(
      'https://example.com/mcp',
    );
    expect(normalizeMcpUrl('http://example.com:80/mcp')).toBe(
      'http://example.com/mcp',
    );
  });

  it('keeps a non-default port', () => {
    expect(normalizeMcpUrl('http://localhost:8080/mcp')).toBe(
      'http://localhost:8080/mcp',
    );
    expect(normalizeMcpUrl('https://example.com:80/mcp')).toBe(
      'https://example.com:80/mcp',
    );
  });

  it('drops userinfo and the fragment', () => {
    expect(normalizeMcpUrl('https://user:secret@example.com/mcp#frag')).toBe(
      'https://example.com/mcp',
    );
  });

  it('drops trailing slashes, including a bare root', () => {
    expect(normalizeMcpUrl('https://example.com/mcp/')).toBe(
      'https://example.com/mcp',
    );
    expect(normalizeMcpUrl('https://example.com/mcp//')).toBe(
      'https://example.com/mcp',
    );
    expect(normalizeMcpUrl('https://example.com/')).toBe('https://example.com');
    expect(normalizeMcpUrl('https://example.com')).toBe('https://example.com');
  });

  it('keeps the query', () => {
    expect(normalizeMcpUrl('https://example.com/mcp/?a=1&B=2#x')).toBe(
      'https://example.com/mcp?a=1&B=2',
    );
  });

  it('gives equivalent spellings the same key', () => {
    const keys = new Set(
      [
        'https://mcp.zernio.com/mcp',
        'HTTPS://mcp.ZERNIO.com:443/mcp/',
        'https://token@mcp.zernio.com/mcp#top',
        '  https://mcp.zernio.com/mcp  ',
      ].map(normalizeMcpUrl),
    );
    expect([...keys]).toEqual(['https://mcp.zernio.com/mcp']);
  });

  it('returns null for an invalid or non-HTTP URL', () => {
    expect(normalizeMcpUrl('')).toBeNull();
    expect(normalizeMcpUrl('not a url')).toBeNull();
    expect(normalizeMcpUrl('/relative/path')).toBeNull();
    expect(normalizeMcpUrl('ftp://example.com/mcp')).toBeNull();
    expect(normalizeMcpUrl('file:///tmp/mcp')).toBeNull();
  });
});
