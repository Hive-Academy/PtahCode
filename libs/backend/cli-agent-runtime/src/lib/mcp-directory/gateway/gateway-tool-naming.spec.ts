import { createHash } from 'node:crypto';
import {
  GATEWAY_ALIAS_MAX,
  GATEWAY_TOOL_NAME_MAX,
  RESERVED_GATEWAY_ALIAS,
  assignGatewayAliases,
  buildGatewayToolName,
  configAliasBase,
  connectorAliasBase,
  gatewayToolName,
  isValidGatewayToolName,
  sanitizeGatewayAlias,
} from './gateway-tool-naming';

const hex = (value: string, length: number): string =>
  createHash('sha256').update(value, 'utf8').digest('hex').slice(0, length);

describe('gateway tool naming', () => {
  it('fits mcp__ptah__ plus the name into the 64-char Codex/OpenAI limit', () => {
    expect('mcp__ptah__'.length + GATEWAY_TOOL_NAME_MAX).toBe(64);
  });

  describe('sanitizeGatewayAlias', () => {
    it('lowercases to [a-z0-9-] and collapses dashes', () => {
      expect(sanitizeGatewayAlias('My_Server.Name!!')).toBe('my-server-name');
      expect(sanitizeGatewayAlias('--a__b--')).toBe('a-b');
    });

    it('caps the alias at 20 chars without a trailing dash', () => {
      const alias = sanitizeGatewayAlias('abcdefghijklmnopqrs-tuvwxyz');
      expect(alias).toBe('abcdefghijklmnopqrs');
      expect(sanitizeGatewayAlias('x'.repeat(40))).toHaveLength(
        GATEWAY_ALIAS_MAX,
      );
    });

    it('falls back to mcp when nothing is left', () => {
      expect(sanitizeGatewayAlias('***')).toBe('mcp');
      expect(sanitizeGatewayAlias('')).toBe('mcp');
    });
  });

  describe('connectorAliasBase', () => {
    it('derives zernio from the OAuth connector key', () => {
      expect(connectorAliasBase('oauth-mcp.zernio.com-mcp')).toBe('zernio');
    });

    it('prefers the URL host when one is given', () => {
      expect(
        connectorAliasBase('oauth-whatever', 'https://mcp.zernio.com/mcp'),
      ).toBe('zernio');
    });

    it('strips the smithery- prefix', () => {
      expect(connectorAliasBase('smithery-exa')).toBe('exa');
    });

    it('drops leading mcp./api./www. labels and the public suffix', () => {
      expect(connectorAliasBase('oauth-api.github.com-mcp')).toBe('github');
      expect(connectorAliasBase('oauth-www.example.co.uk-v1-mcp')).toBe(
        'example',
      );
      expect(connectorAliasBase('k', 'https://tools.acme.io/mcp')).toBe(
        'tools-acme',
      );
      expect(connectorAliasBase('k', 'https://mcp.my-host.dev:8443/x')).toBe(
        'my-host',
      );
    });

    it('keeps a dotless host and an IP address readable', () => {
      expect(connectorAliasBase('oauth-localhost-8080-mcp')).toBe(
        'localhost-8080-mcp',
      );
      expect(connectorAliasBase('k', 'http://127.0.0.1:3000/mcp')).toBe(
        '127-0-0-1',
      );
    });
  });

  describe('configAliasBase', () => {
    it('sanitizes the config key', () => {
      expect(configAliasBase('Linear Tools')).toBe('linear-tools');
    });
  });

  describe('assignGatewayAliases', () => {
    const smaller = 'https://mcp.zernio.com/mcp';
    const larger = 'https://zernio.example.org/mcp';

    it('gives the smaller key the bare alias and suffixes the other', () => {
      const aliases = assignGatewayAliases([
        { key: larger, baseAlias: 'zernio' },
        { key: smaller, baseAlias: 'zernio' },
      ]);
      expect(aliases.get(smaller)).toBe('zernio');
      expect(aliases.get(larger)).toBe(`zernio_${hex(larger, 4)}`);
      expect(aliases.get(larger)).toMatch(/^zernio_[0-9a-f]{4}$/);
    });

    it('is stable regardless of input order and when servers are added', () => {
      const first = assignGatewayAliases([
        { key: smaller, baseAlias: 'zernio' },
        { key: larger, baseAlias: 'zernio' },
      ]);
      const later = assignGatewayAliases([
        { key: 'https://other.dev/mcp', baseAlias: 'other' },
        { key: larger, baseAlias: 'zernio' },
        { key: 'https://zzz.zernio.net/mcp', baseAlias: 'zernio' },
        { key: smaller, baseAlias: 'zernio' },
      ]);
      expect(later.get(smaller)).toBe(first.get(smaller));
      expect(later.get(larger)).toBe(first.get(larger));
      expect(later.get('https://other.dev/mcp')).toBe('other');
    });

    it('never gives the reserved ptah alias bare', () => {
      const key = 'https://ptah.example.com/mcp';
      const aliases = assignGatewayAliases([
        { key, baseAlias: RESERVED_GATEWAY_ALIAS },
      ]);
      expect(aliases.get(key)).toBe(`ptah_${hex(key, 4)}`);
    });

    it('sanitizes base aliases before grouping', () => {
      const aliases = assignGatewayAliases([
        { key: 'b', baseAlias: 'Zernio' },
        { key: 'a', baseAlias: 'zernio' },
      ]);
      expect(aliases.get('a')).toBe('zernio');
      expect(aliases.get('b')).toBe(`zernio_${hex('b', 4)}`);
    });
  });

  describe('gatewayToolName', () => {
    it('joins alias and tool with __', () => {
      expect(gatewayToolName('zernio', 'create_post')).toBe(
        'zernio__create_post',
      );
    });

    it('is stable for the same input', () => {
      expect(gatewayToolName('zernio', 'x'.repeat(80))).toBe(
        gatewayToolName('zernio', 'x'.repeat(80)),
      );
    });

    it('keeps a tool that exactly fills the 53-char budget', () => {
      const tool = 't'.repeat(GATEWAY_TOOL_NAME_MAX - 'zernio__'.length);
      const name = gatewayToolName('zernio', tool);
      expect(name).toBe(`zernio__${tool}`);
      expect(name).toHaveLength(GATEWAY_TOOL_NAME_MAX);
    });

    it('truncates an over-budget tool and appends _ plus 6 hex', () => {
      const tool = 'a'.repeat(60);
      const name = gatewayToolName('zernio_ab12', tool);
      expect(name).toHaveLength(GATEWAY_TOOL_NAME_MAX);
      expect(name.endsWith(`_${hex(tool, 6)}`)).toBe(true);
      expect(name.startsWith('zernio_ab12__aaa')).toBe(true);
      expect(isValidGatewayToolName(name)).toBe(true);
    });

    it('keeps two long tools with a shared prefix distinct', () => {
      const base = 'b'.repeat(60);
      expect(gatewayToolName('zernio', `${base}_one`)).not.toBe(
        gatewayToolName('zernio', `${base}_two`),
      );
    });

    it('caps the name at 53 chars for the longest suffixed alias', () => {
      const alias = `${'a'.repeat(GATEWAY_ALIAS_MAX)}_abcd`;
      const name = gatewayToolName(alias, 'some_very_long_upstream_tool_name');
      expect(name.length).toBeLessThanOrEqual(GATEWAY_TOOL_NAME_MAX);
      expect(isValidGatewayToolName(name)).toBe(true);
    });

    it('replaces invalid characters and hashes so sanitized names stay distinct', () => {
      const dotted = gatewayToolName('github', 'repo.list');
      const spaced = gatewayToolName('github', 'repo list');
      expect(dotted).toBe(`github__repo_list_${hex('repo.list', 6)}`);
      expect(dotted).not.toBe(spaced);
      expect(isValidGatewayToolName(dotted)).toBe(true);
    });
  });

  describe('buildGatewayToolName', () => {
    it('returns the generated name when it is not a host tool name', () => {
      expect(
        buildGatewayToolName('zernio', 'create_post', new Set(['ptah_grep'])),
      ).toBe('zernio__create_post');
    });

    it('rejects a generated name equal to a host tool name', () => {
      expect(
        buildGatewayToolName(
          'zernio',
          'create_post',
          new Set(['zernio__create_post']),
        ),
      ).toBeNull();
    });

    it('rejects a malformed alias', () => {
      expect(buildGatewayToolName('bad alias', 'x', new Set())).toBeNull();
    });
  });

  describe('isValidGatewayToolName', () => {
    it('accepts [A-Za-z0-9_-] up to 53 chars only', () => {
      expect(isValidGatewayToolName('a__B-1')).toBe(true);
      expect(isValidGatewayToolName('')).toBe(false);
      expect(isValidGatewayToolName('a.b')).toBe(false);
      expect(isValidGatewayToolName('a'.repeat(54))).toBe(false);
    });
  });
});
