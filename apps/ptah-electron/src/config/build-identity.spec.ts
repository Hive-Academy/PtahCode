import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatBuildIdentitySummary,
  readBuildIdentity,
  readDistributionChannel,
} from './build-identity';

describe('formatBuildIdentitySummary', () => {
  it('includes a validated commit', () => {
    expect(
      formatBuildIdentitySummary('1.2.3', 'direct', {
        kind: 'local-production',
        gitSha: 'a'.repeat(40),
      }),
    ).toBe(`Electron build identity: version=1.2.3 channel=direct commit=${'a'.repeat(40)}`);
  });

  it('reports unknown when metadata is missing', () => {
    expect(formatBuildIdentitySummary('1.2.3', 'microsoft-store', null)).toBe(
      'Electron build identity: version=1.2.3 channel=microsoft-store commit=unknown',
    );
  });

  it('reports unknown when metadata is malformed', () => {
    expect(
      formatBuildIdentitySummary('1.2.3', 'direct', {
        kind: 'local-production',
        gitSha: 'not-a-sha',
      }),
    ).toBe('Electron build identity: version=1.2.3 channel=direct commit=unknown');
  });
});

describe('readDistributionChannel', () => {
  it('reports the Microsoft Store channel when Electron sets windowsStore', () => {
    expect(readDistributionChannel({ windowsStore: true })).toBe(
      'microsoft-store',
    );
  });

  it.each([{}, { windowsStore: false }])(
    'reports the direct channel otherwise (%o)',
    (runtime) => {
      expect(readDistributionChannel(runtime)).toBe('direct');
    },
  );
});

describe('readBuildIdentity', () => {
  it('accepts the immutable local-production metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ptah-build-identity-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        ptahBuildIdentity: {
          kind: 'local-production',
          gitSha: 'a'.repeat(40),
        },
      }),
    );

    expect(readBuildIdentity(dir)).toEqual({
      kind: 'local-production',
      gitSha: 'a'.repeat(40),
    });
  });

  it.each([
    {},
    { ptahBuildIdentity: { kind: 'production', gitSha: 'a'.repeat(40) } },
    { ptahBuildIdentity: { kind: 'local-production', gitSha: 'short' } },
  ])('treats absent or invalid metadata as production', (manifest) => {
    const dir = mkdtempSync(join(tmpdir(), 'ptah-build-identity-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
    expect(readBuildIdentity(dir)).toBeNull();
  });
});
