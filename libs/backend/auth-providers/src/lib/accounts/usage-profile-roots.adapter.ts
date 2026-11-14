import type { ClaudeUsageProfileRoots } from '@ptah-extension/auth-providers-tokens';

type ActiveProfilesReader = {
  list(): readonly { profile_id: string; canonical_route: string }[];
};

/** Projects only the canonical directory and opaque ID from active stored accounts. */
export class UsageProfileRootsAdapter implements ClaudeUsageProfileRoots {
  constructor(private readonly accounts: ActiveProfilesReader) {}

  async listActiveRoots(): Promise<readonly { profileId: string; canonicalConfigDir: string }[]> {
    return this.accounts.list().map((account) => ({
      profileId: account.profile_id,
      canonicalConfigDir: account.canonical_route,
    }));
  }
}
