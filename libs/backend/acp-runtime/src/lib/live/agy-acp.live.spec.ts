/**
 * Live check of the ACP runtime against a real, signed-in `agy acp`
 * (Antigravity CLI >= 1.5.1). Skipped unless `PTAH_LIVE_AGY=1`; never runs in
 * CI. It drives `createAcpSession` end to end: the handshake, `session/new`,
 * one prompt, then a second process that re-attaches with `session/load` and
 * must replay the first turn, the user turn included.
 *
 * Run (one spec, no Nx):
 *   PTAH_LIVE_AGY=1 npx jest --config libs/backend/acp-runtime/jest.config.ts \
 *     --runInBand --coverage=false --runTestsByPath \
 *     libs/backend/acp-runtime/src/lib/live/agy-acp.live.spec.ts
 * `PTAH_AGY_BINARY` overrides the binary (default `agy` on PATH).
 *
 * The profile is local to this spec on purpose: it checks the runtime with the
 * bare `agy acp` argv; the lane profile (`antigravityAcpProfile`) is covered
 * by the cli-agent-runtime live spec of the Antigravity lane.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderSessionEvent } from '@ptah-extension/provider-session-contracts';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { createLiveProcessSpawner } from '../../testing/live-process-spawner';
import { createAcpSession, type AcpSession } from '../acp-session-runtime';
import type { AcpVendorProfile } from '../acp-vendor-profile';

const LIVE = process.env['PTAH_LIVE_AGY'] === '1';
const BINARY = process.env['PTAH_AGY_BINARY'] || 'agy';
const TOKEN = 'PTAH-LIVE-7341';

const liveSpawner = createLiveProcessSpawner();

const agyLiveProfile: AcpVendorProfile = {
  vendor: 'antigravity',
  displayName: 'Antigravity',
  signInHint: 'run `agy` and sign in',
  cancelBehavior: 'await-reply',
  buildSpawn: () => ({ args: ['acp'], needsConsole: process.platform === 'win32' }),
  buildMcpServers: () => [],
};

function open(
  cwd: string,
  events: ProviderSessionEvent[],
  abort: AbortController,
  resumeSessionId?: string,
): AcpSession {
  return createAcpSession({
    profile: agyLiveProfile,
    options: {
      workingDirectory: cwd,
      agentId: 'live-agy',
      mcp: [],
      ...(resumeSessionId
        ? { resumeSessionId, attachMethod: 'load' as const, attachFailure: 'error' as const }
        : {}),
    },
    command: BINARY,
    baseEnv: { ...process.env },
    spawner: liveSpawner,
    logger: createMockLogger(),
    signal: abort.signal,
    onEvent: (event) => events.push(event),
  });
}

(LIVE ? describe : describe.skip)('agy acp live (PTAH_LIVE_AGY=1)', () => {
  let cwd: string;
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ptah-agy-live-'));
  });
  afterAll(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('handshakes, prompts once, and replays the turn through session/load', async () => {
    const firstEvents: ProviderSessionEvent[] = [];
    const firstAbort = new AbortController();
    const first = open(cwd, firstEvents, firstAbort);
    const setup = await first.start();
    const errors = firstEvents.filter((event) => event.type === 'error');
    expect(errors).toEqual([]);
    expect(setup).toEqual({ ok: true, restoredContext: false });
    const sessionId = first.getSessionId();
    expect(sessionId).toBeTruthy();

    const code = await first.prompt(`Reply with exactly ${TOKEN} and nothing else.`);
    const reply = firstEvents
      .flatMap((event) => (event.type === 'textDelta' ? [event.delta] : []))
      .join('');
    expect(firstEvents.filter((event) => event.type === 'error')).toEqual([]);
    expect(code).toBe(0);
    expect(reply).toContain(TOKEN);
    firstAbort.abort();
    await first.exited;

    const secondEvents: ProviderSessionEvent[] = [];
    const secondAbort = new AbortController();
    const second = open(cwd, secondEvents, secondAbort, sessionId);
    try {
      await expect(second.start()).resolves.toEqual({ ok: true, restoredContext: true });
      const replay = second.getReplay();
      const userTurns = replay.flatMap((event) =>
        event.type === 'userText' ? [event.text] : [],
      );
      expect(userTurns.some((text) => text.includes(TOKEN))).toBe(true);
      const replayedReply = replay
        .flatMap((event) => (event.type === 'textDelta' ? [event.delta] : []))
        .join('');
      expect(replayedReply).toContain(TOKEN);
      expect(replay.every((event) => event.replayed === true)).toBe(true);
    } finally {
      secondAbort.abort();
      await second.exited;
    }
  }, 300_000);
});
