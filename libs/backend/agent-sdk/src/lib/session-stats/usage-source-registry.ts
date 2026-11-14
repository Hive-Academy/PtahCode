import path from 'node:path';
import os from 'node:os';
import type { ClaudeUsageProfileRoots } from '@ptah-extension/auth-providers-tokens';

/** Roots selected by the default Claude install and active named profiles. */
export class ClaudeUsageSourceRegistry {
  constructor(private readonly profiles: ClaudeUsageProfileRoots) {}

  async listRoots(): Promise<readonly string[]> {
    const named = await this.profiles.listActiveRoots();
    return [...new Set([
      path.join(process.env['CLAUDE_CONFIG_DIR']?.trim() || path.join(os.homedir(), '.claude'), 'projects'),
      ...named.map((profile) => path.join(profile.canonicalConfigDir, 'projects')),
    ])];
  }
}
