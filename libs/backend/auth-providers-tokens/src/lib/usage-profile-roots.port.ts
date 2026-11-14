/** Read-only roots for active named Claude profiles. No account data crosses this port. */
export interface ClaudeUsageProfileRoots {
  listActiveRoots(): Promise<readonly { profileId: string; canonicalConfigDir: string }[]>;
}
