import 'reflect-metadata';
import { parseClaudeAccountEmail } from './claude-account-email';

const directory = '/tmp/ptah-account';
const status = (overrides: Record<string, unknown> = {}): string => JSON.stringify({
  loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty',
  configDirectory: directory, email: 'person@example.test', orgName: 'Personal', orgId: null,
  subscriptionType: 'max', ...overrides,
});

describe('parseClaudeAccountEmail', () => {
  it('extracts email only from a signed-in status for the canonical directory', () => {
    expect(parseClaudeAccountEmail(status(), 0, directory, 'linux')).toMatchObject({ email: 'person@example.test' });
  });

  it('refuses a different directory, signed-out status and malformed email', () => {
    expect(parseClaudeAccountEmail(status({ configDirectory: '/other' }), 0, directory, 'linux')).toBeNull();
    expect(parseClaudeAccountEmail(status({ loggedIn: false, authMethod: 'none' }), 1, directory, 'linux')).toBeNull();
    expect(parseClaudeAccountEmail(status({ email: 'invalid' }), 0, directory, 'linux')).toBeNull();
  });
});
