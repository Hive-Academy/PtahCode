import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UsageProfileRootsAdapter } from './usage-profile-roots.adapter';

describe('usage profile roots', () => {
  it('returns only active profiles with canonical roots and opaque IDs', async () => {
    const list = jest.fn(() => [
      { profile_id: 'active-id', canonical_route: '/canonical/claude', label: 'private label', credential: 'private credential' },
    ]);
    const adapter = new UsageProfileRootsAdapter({ list });

    expect(await adapter.listActiveRoots()).toEqual([
      { profileId: 'active-id', canonicalConfigDir: '/canonical/claude' },
    ]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('reflects removal from the active store listing', async () => {
    let active = true;
    const adapter = new UsageProfileRootsAdapter({
      list: () => active ? [{ profile_id: 'removed-id', canonical_route: '/canonical/removed' }] : [],
    });
    expect(await adapter.listActiveRoots()).toHaveLength(1);
    active = false;
    expect(await adapter.listActiveRoots()).toEqual([]);
  });

  it('lists only signed-in profiles with a stored identity reference', async () => {
    const identityReference = 'a'.repeat(64);
    const adapter = new UsageProfileRootsAdapter({
      list: () => [
        { profile_id: 'signed-in', canonical_route: '/fixture/signed-in', state: 'signed-in', identity_ref: identityReference },
        { profile_id: 'signed-out', canonical_route: '/fixture/signed-out', state: 'signed-out', identity_ref: identityReference },
        { profile_id: 'missing-state', canonical_route: '/fixture/missing-state', identity_ref: identityReference },
        { profile_id: 'missing-ref', canonical_route: '/fixture/missing-ref', state: 'signed-in' },
        { profile_id: 'null-ref', canonical_route: '/fixture/null-ref', state: 'signed-in', identity_ref: null },
        { profile_id: 'empty-ref', canonical_route: '/fixture/empty-ref', state: 'signed-in', identity_ref: '' },
      ],
    });

    expect(await adapter.listSignedInAccounts()).toEqual([
      { profileId: 'signed-in', canonicalConfigDir: '/fixture/signed-in', identityReference },
    ]);
  });

  it('keeps the port independent of agent-sdk', () => {
    const source = readFileSync(resolve(__dirname, '../../../../auth-providers-tokens/src/lib/usage-profile-roots.port.ts'), 'utf8');
    expect(source).not.toContain('agent-sdk');
  });
});
