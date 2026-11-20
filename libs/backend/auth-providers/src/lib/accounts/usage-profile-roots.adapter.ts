import type { ClaudeUsageProfileRoots } from '@ptah-extension/auth-providers-tokens';

type ActiveProfilesReader = {
  list(): readonly { profile_id: string; canonical_route: string; state?: string; identity_ref?: string | null }[];
};

/** Projects usage roots and opaque identity references from stored accounts. */
export class UsageProfileRootsAdapter implements ClaudeUsageProfileRoots {
  constructor(private readonly accounts: ActiveProfilesReader) {}

  async listActiveRoots(): Promise<readonly { profileId: string; canonicalConfigDir: string }[]> {
    return this.accounts.list().map((account) => ({
      profileId: account.profile_id,
      canonicalConfigDir: account.canonical_route,
    }));
  }

  async listSignedInAccounts(): ReturnType<ClaudeUsageProfileRoots['listSignedInAccounts']> {
    return this.accounts.list().flatMap((account) =>
      account.state === 'signed-in' && account.identity_ref
        ? [{
            profileId: account.profile_id,
            canonicalConfigDir: account.canonical_route,
            identityReference: account.identity_ref,
          }]
        : [],
    );
  }
}
