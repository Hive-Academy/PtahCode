import type { LiveChatSession } from '@ptah-extension/platform-core';
import { createLiveChatSessionResolver, toClaudeLiveChatSession } from './live-chat-session-resolver';

const sessions: LiveChatSession[] = [
  { runtime: 'claude-sdk', sessionId: 'claude', tabId: 'claude-tab' },
  { runtime: 'codex-app-server', sessionId: 'codex', tabId: 'codex-tab' },
  { runtime: 'provider-session', sessionId: 'acp', tabId: 'acp-tab' },
];

function source(session: LiveChatSession) {
  return (id: string) => id === session.sessionId || id === session.tabId ? [session] : [];
}

describe('live chat session resolver', () => {
  const resolver = createLiveChatSessionResolver(sessions.map(source));

  it.each(sessions)('resolves the id and tab of $runtime', (session) => {
    expect(resolver.resolve(session.sessionId)).toEqual({ kind: 'resolved', session });
    expect(resolver.resolve(session.tabId ?? '')).toEqual({ kind: 'resolved', session });
  });

  it('resolves a Claude tab before its SDK session id is assigned', () => {
    const pending = createLiveChatSessionResolver([
      (id) => id === 'pending-tab' ? [toClaudeLiveChatSession({
        realSessionId: null,
        tabId: 'pending-tab',
        currentModel: 'claude',
        permissionLevel: 'ask',
        config: { projectPath: '/workspace', sessionName: 'Pending' },
      })] : [],
    ]);
    expect(pending.resolve('pending-tab')).toMatchObject({
      kind: 'resolved',
      session: {
        runtime: 'claude-sdk', sessionId: 'pending-tab', tabId: 'pending-tab',
        cwd: '/workspace', workspaceRoot: '/workspace', permissionLevel: 'ask',
      },
    });
  });

  it.each(['', 'unknown'])('returns unresolved for %j', (id) => {
    expect(resolver.resolve(id)).toEqual({ kind: 'unresolved' });
  });

  it('refuses a tab alias that collides with another runtime id', () => {
    const conflict = createLiveChatSessionResolver([
      ...sessions.map(source),
      source({ runtime: 'provider-session', sessionId: 'other', tabId: 'codex' }),
    ]);
    expect(conflict.resolve('codex')).toEqual({ kind: 'ambiguous' });
  });
});
