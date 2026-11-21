import type {
  SessionId,
  SessionRuntimeControls,
  SessionRuntimeIdentity,
} from '@ptah-extension/shared';
import {
  SessionRuntimeRouter,
  type NativeSessionControls,
} from './session-runtime-router';
import { ChatRuntimeAdmissionError } from './routing-agent-adapter';

const id = 'session' as SessionId;
const base = {
  version: 1,
  sessionId: id,
  workspaceId: '/workspace',
} as const;
const identities = {
  claude: { ...base, providerId: 'anthropic', runtime: 'claude-sdk' },
  codex: {
    ...base,
    providerId: 'openai-codex',
    runtime: 'codex-app-server',
    codex: { normalizedHome: '/codex' },
  },
  providerSession: {
    ...base,
    providerId: 'antigravity-cli',
    runtime: 'provider-session',
    providerSession: { profile: 'antigravity' },
  },
} satisfies Record<string, SessionRuntimeIdentity>;

function controls(): jest.Mocked<SessionRuntimeControls> {
  return {
    setPermission: jest
      .fn()
      .mockResolvedValue({ timing: 'effectiveNow', revision: 1 }),
    setModel: jest.fn().mockResolvedValue({ timing: 'nextTurn', revision: 2 }),
    setEffort: jest.fn().mockResolvedValue({ timing: 'nextTurn', revision: 3 }),
    interrupt: jest.fn().mockResolvedValue(true),
    compact: jest.fn().mockResolvedValue(undefined),
  };
}

function nativeControls(canSend = true): jest.Mocked<NativeSessionControls> {
  return {
    ...controls(),
    canSendFollowUp: jest.fn((_sessionId: SessionId) => canSend),
    releaseSession: jest.fn((_sessionId: SessionId) => undefined),
  };
}

function router(
  identity: SessionRuntimeIdentity,
  options: { codex?: boolean; providerSessions?: boolean } = {},
) {
  const legacy = controls();
  const codex = options.codex === false ? null : nativeControls();
  const providerSessions =
    options.providerSessions === false ? null : nativeControls();
  const unit = new SessionRuntimeRouter(
    { lookup: () => ({ persisted: identity }) },
    legacy,
    codex,
    providerSessions,
  );
  return { unit, legacy, codex, providerSessions };
}

describe('SessionRuntimeRouter provider-session arm', () => {
  it('routes every control of a provider session to its controls', async () => {
    const h = router(identities.providerSession);
    await h.unit.setPermission(id, 'ask' as never);
    await h.unit.setModel(id, 'gemini');
    await h.unit.setEffort(id, undefined);
    await h.unit.compact(id);
    await h.unit.interrupt(id);
    expect(h.providerSessions?.setPermission).toHaveBeenCalledTimes(1);
    expect(h.providerSessions?.setModel).toHaveBeenCalledWith(id, 'gemini');
    expect(h.providerSessions?.setEffort).toHaveBeenCalledTimes(1);
    expect(h.providerSessions?.compact).toHaveBeenCalledTimes(1);
    expect(h.providerSessions?.interrupt).toHaveBeenCalledTimes(1);
    expect(h.legacy.setModel).not.toHaveBeenCalled();
    expect(h.codex?.setModel).not.toHaveBeenCalled();
  });

  it('answers follow-up admission and release from provider-session controls', () => {
    const h = router(identities.providerSession);
    expect(h.unit.canSendFollowUp(id)).toBe(true);
    expect(h.unit.acceptsFollowUpWithoutStream(id)).toBe(true);
    h.unit.releaseSession(id);
    expect(h.providerSessions?.releaseSession).toHaveBeenCalledWith(id);
    expect(h.codex?.releaseSession).not.toHaveBeenCalled();
  });

  it('refuses controls of a provider session whose runtime is not bound', async () => {
    const h = router(identities.providerSession, { providerSessions: false });
    await expect(h.unit.setModel(id, 'gemini')).rejects.toBeInstanceOf(
      ChatRuntimeAdmissionError,
    );
    expect(h.legacy.setModel).not.toHaveBeenCalled();
    expect(h.unit.canSendFollowUp(id)).toBe(false);
    expect(h.unit.acceptsFollowUpWithoutStream(id)).toBe(false);
    expect(() => h.unit.releaseSession(id)).not.toThrow();
  });

  it('keeps Codex and Claude sessions on their arms with provider sessions bound', async () => {
    const codex = router(identities.codex);
    await codex.unit.setModel(id, 'gpt');
    expect(codex.codex?.setModel).toHaveBeenCalledTimes(1);
    expect(codex.providerSessions?.setModel).not.toHaveBeenCalled();
    const claude = router(identities.claude);
    await claude.unit.setModel(id, 'sonnet');
    expect(claude.legacy.setModel).toHaveBeenCalledTimes(1);
    expect(claude.unit.canSendFollowUp(id)).toBe(true);
  });

  it('refuses a Codex session when only provider sessions are bound', async () => {
    const h = router(identities.codex, { codex: false });
    await expect(h.unit.setModel(id, 'gpt')).rejects.toBeInstanceOf(
      ChatRuntimeAdmissionError,
    );
    expect(h.legacy.setModel).not.toHaveBeenCalled();
  });
});
