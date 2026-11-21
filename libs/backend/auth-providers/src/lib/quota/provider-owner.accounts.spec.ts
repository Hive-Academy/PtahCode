import 'reflect-metadata';
import { claudeIdentityReference } from '@ptah-extension/agent-sdk';
import type { SessionQuotaProbe } from '@ptah-extension/agent-sdk';
import type { ClaudeAccountNamedRoute } from '@ptah-extension/auth-providers-tokens';
import type { IAuthSecretsService, Logger } from '@ptah-extension/vscode-core';
import type { CodexHomeResolver } from '../providers/codex/codex-home-resolver';
import type { ICodexAccountUsageService } from '../providers/codex/codex-provider.types';
import {
  ProviderOwnerResolver,
  claudeAccountOwnerKey,
  claudeOwnerKeyFromIdentityReference,
} from './provider-owner.resolver';

function route(dir: string, runId = 'run'): ClaudeAccountNamedRoute {
  // Test-only admission fixture; production callers receive this from admission.
  return {
    kind: 'named',
    provider: 'claude',
    profileId: dir,
    canonicalConfigDir: dir,
    routeFingerprint: dir,
    routeRevision: 1,
    authEpoch: 1,
    runId,
  } as ClaudeAccountNamedRoute;
}

function harness() {
  const readAccountForRoute = jest.fn();
  const resolver = new ProviderOwnerResolver(
    {} as Logger,
    {} as IAuthSecretsService,
    { readAccountForRoute } as Pick<
      SessionQuotaProbe,
      'readAccountForRoute'
    > as SessionQuotaProbe,
    {} as ICodexAccountUsageService,
    {} as CodexHomeResolver,
  );
  return { resolver, readAccountForRoute };
}

describe('Claude account owners', () => {
  it('derives the same owner key from a stored identity reference and account metadata', () => {
    const email = 'user@example.invalid';
    const organization = 'fixture-org';
    const ref = claudeIdentityReference(email, organization);
    const ownerKey = claudeAccountOwnerKey({ email, organization });

    expect(ownerKey).toEqual(expect.any(String));
    expect(claudeOwnerKeyFromIdentityReference(ref ?? '')).toBe(ownerKey);
  });

  it.each(['', 'a'.repeat(63), 'g'.repeat(64), 'A'.repeat(64)])('rejects malformed identity reference %j', (ref) => {
    expect(claudeOwnerKeyFromIdentityReference(ref)).toBeNull();
  });

  it('uses trimmed email and organization, independent of the configuration directory', async () => {
    const { resolver, readAccountForRoute } = harness();
    readAccountForRoute.mockResolvedValue({
      status: 'available',
      value: { email: ' a@example.test ', organization: ' org ' },
    });
    const first = await resolver.ownerForSession('s1', route('/one'));
    const second = await resolver.ownerForSession('s2', route('/two'));
    expect(first).toEqual(second);
    expect(first.key).toBe(
      claudeAccountOwnerKey({ email: 'a@example.test', organization: 'org' }),
    );
    expect(JSON.stringify(first)).not.toMatch(/example|org|one|two/);
    expect(readAccountForRoute).toHaveBeenCalledWith('s2', route('/two'));
  });

  it('separates changed email and changed organization', () => {
    const original = claudeAccountOwnerKey({ email: 'a', organization: 'org' });
    expect(claudeAccountOwnerKey({ email: 'b', organization: 'org' })).not.toBe(
      original,
    );
    expect(
      claudeAccountOwnerKey({ email: 'a', organization: 'other' }),
    ).not.toBe(original);
    expect(claudeAccountOwnerKey({ email: ' ' })).toBeNull();
  });

  it('never promotes failed route/run proof to the previously known owner', async () => {
    const { resolver, readAccountForRoute } = harness();
    readAccountForRoute.mockResolvedValueOnce({
      status: 'available',
      value: { email: 'a' },
    });
    const known = await resolver.ownerForSession('s', route('/one'));
    readAccountForRoute.mockResolvedValue({
      status: 'unavailable',
      code: 'stale-epoch',
    });
    const failed = await resolver.ownerForSession('s', route('/one'));
    const otherRun = await resolver.ownerForSession('s', route('/one', 'next'));
    expect(failed.identityKind).toBe('unknown');
    expect(failed.key).not.toBe(known.key);
    expect(otherRun.key).not.toBe(failed.key);
  });
});
