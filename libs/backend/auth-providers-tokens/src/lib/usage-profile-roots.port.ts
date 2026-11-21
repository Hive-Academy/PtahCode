/** Read-only roots and opaque identity references for named Claude profiles. */
export interface ClaudeUsageProfileRoots {
  listActiveRoots(): Promise<readonly { profileId: string; canonicalConfigDir: string }[]>;
  listSignedInAccounts(): Promise<readonly { profileId: string; canonicalConfigDir: string; identityReference: string }[]>;
}
