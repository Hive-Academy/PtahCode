import { createHash } from 'crypto';

/** Wizard hashes normalize Windows line endings before hashing UTF-8 text. */
export function wizardAgentHash(content: string): string {
  return `sha256:${createHash('sha256')
    .update(content.replace(/\r\n/g, '\n'), 'utf8')
    .digest('hex')}`;
}
