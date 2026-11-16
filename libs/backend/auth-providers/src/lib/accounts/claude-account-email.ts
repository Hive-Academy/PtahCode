import { z } from 'zod';
import { parseClaudeAccountStatus } from './claude-account-status';

/** Extracted only for the explicit reveal request; never enters account status or storage. */
export function parseClaudeAccountEmail(
  output: string, exitCode: number | null, canonicalDir: string, platform: NodeJS.Platform,
): { readonly email: string; readonly identityReference: string; readonly emailOnlyReference: string | null } | null {
  const status = parseClaudeAccountStatus(output, exitCode, canonicalDir, platform);
  if (!status?.loggedIn || !status.configDirectoryMatches || !status.identityReference) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    // degradation-audit: reported - the status parser already refused malformed output; this returns no email.
    return null;
  }
  const email = z.object({ email: z.string().trim().email() }).passthrough().safeParse(parsed);
  return email.success ? { email: email.data.email, identityReference: status.identityReference,
    emailOnlyReference: status.emailOnlyReference } : null;
}
