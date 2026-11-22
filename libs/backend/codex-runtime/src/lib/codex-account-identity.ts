import { createHash } from 'node:crypto';

/** Account identifiers one Codex App Server read can report. */
export interface CodexAccountIdentity {
  /** `account/rateLimits/read` `accountId`; optional in the protocol. */
  readonly accountId?: string | null;
  /** `account/read` ChatGPT email; the fallback when no account id is reported. */
  readonly email?: string | null;
}

/**
 * The one identity digest every Codex usage path derives an owner from: the
 * SHA-256 hex of the normalized home and the account id, or the email when
 * the server reports no account id. The legacy fallback reader and the shared
 * usage client both call this, so the owner key stays the same whichever
 * reader answered. The digest is identity material, not an owner key: the
 * quota layer turns it into the canonical `openai-codex#account:<fp>` form.
 * Raw identifiers never leave this function. `null` when neither is present.
 */
export function codexAccountIdentityDigest(
  normalizedHome: string,
  identity: CodexAccountIdentity,
): string | null {
  const accountId = identity.accountId?.trim();
  const email = identity.email?.trim().toLowerCase();
  const material = accountId
    ? `account-id\0${accountId}`
    : email
      ? `email\0${email}`
      : null;
  return material === null
    ? null
    : createHash('sha256')
        .update(`${normalizedHome}\0${material}`, 'utf8')
        .digest('hex');
}
