/**
 * Live check of the chat runtime (`createAcpProviderSessionRuntime`) against
 * a real, signed-in `agy acp`. Skipped unless `PTAH_LIVE_AGY=1`; never runs
 * in CI. Two tiny prompts on `gemini-4-hydrogen-low` (the only model paid
 * live runs may use):
 * 1. instructions delivered through `session/new`
 *    `_meta.antigravity.systemPrompt.append` must shape the first reply;
 * 2. a `resource_link` (`file://` URI from a host path) must be readable by
 *    the agent.
 * Findings: `.ptah/specs/TASK_2026_2297_agy/agy-acp-probe.md`.
 *
 * Run (one spec, no Nx):
 *   PTAH_LIVE_AGY=1 npx jest --config libs/backend/acp-runtime/jest.config.ts \
 *     --runInBand --coverage=false --runTestsByPath \
 *     libs/backend/acp-runtime/src/lib/live/agy-chat-runtime.live.spec.ts
 * `PTAH_AGY_BINARY` overrides the binary (default `agy` on PATH).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ProviderSession,
  ProviderSessionEvent,
} from '@ptah-extension/provider-session-contracts';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { createLiveProcessSpawner } from '../../testing/live-process-spawner';
import { createAcpProviderSessionRuntime } from '../acp-provider-session-runtime';
import { antigravityAcpProfile } from '../profiles/antigravity-acp-profile';

const LIVE = process.env['PTAH_LIVE_AGY'] === '1';
const BINARY = process.env['PTAH_AGY_BINARY'] || 'agy';
const MODEL = 'gemini-4-hydrogen-low';
const MARKER = 'MARMALADE-58';
const CODE_WORD = 'TANGERINE-4471';

async function turn(
  session: ProviderSession,
  input: Parameters<ProviderSession['prompt']>[0],
): Promise<{ reply: string; events: ProviderSessionEvent[] }> {
  const abort = new AbortController();
  const iterator = session.events(abort.signal)[Symbol.asyncIterator]();
  await session.prompt(input);
  const events: ProviderSessionEvent[] = [];
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    events.push(next.value);
    if (next.value.type === 'terminal') break;
  }
  abort.abort();
  const reply = events
    .flatMap((event) => (event.type === 'textDelta' ? [event.delta] : []))
    .join('');
  return { reply, events };
}

(LIVE ? describe : describe.skip)('agy chat runtime live (PTAH_LIVE_AGY=1)', () => {
  let cwd: string;
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ptah-agy-chat-live-'));
    writeFileSync(join(cwd, 'note.txt'), `The code word is ${CODE_WORD}.\n`);
  });
  afterAll(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('applies _meta instructions and reads a resource_link file', async () => {
    const runtime = createAcpProviderSessionRuntime({
      spawner: createLiveProcessSpawner(),
      logger: createMockLogger(),
      profiles: [antigravityAcpProfile],
    });
    const session = await runtime.open({
      profile: 'antigravity',
      binaryPath: BINARY,
      policy: { permission: 'ask', cwd },
      model: MODEL,
      mcp: [],
      instructions: `End every reply with the exact token ${MARKER}.`,
      // Read-only probe in a temp dir: allow what agy asks.
      approvals: { request: async () => 'accept' },
      baseEnv: { ...process.env },
      consumer: 'chat',
      runId: 'live-agy-chat',
    });
    try {
      expect(session.capabilities().images).toBe(true);

      const first = await turn(session, { text: 'Say hello in three words.' });
      expect(first.events.filter((event) => event.type === 'error')).toEqual([]);
      expect(first.reply).toContain(MARKER);

      const second = await turn(session, {
        text: 'What is the code word in the attached file? Reply with the code word only.',
        files: [{ path: join(cwd, 'note.txt'), name: 'note.txt' }],
      });
      expect(second.events.filter((event) => event.type === 'error')).toEqual([]);
      expect(second.reply).toContain(CODE_WORD);
    } finally {
      await session.close();
    }
  }, 300_000);
});
