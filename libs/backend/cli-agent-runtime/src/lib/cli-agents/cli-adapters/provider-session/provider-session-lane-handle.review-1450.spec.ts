/**
 * PR #1450 review fixes of the provider-session lane handle, against the
 * scripted fake ACP agent (the real ACP runtime runs underneath).
 */
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import type { AcpVendorProfile } from '@ptah-extension/acp-runtime';
import {
  createFakeAcpAgent,
  createFakeAcpTransport,
  type FakeAcpAgent,
  type FakeAcpTransport,
} from '@ptah-extension/acp-runtime/testing';
import type { CliCommandOptions, SdkHandle } from '../cli-adapter.interface';
import { createProviderSessionLaneHandle } from './provider-session-lane-handle';

const profile: AcpVendorProfile = {
  vendor: 'opencode',
  displayName: 'Test Agent',
  signInHint: 'run `test login`',
  cancelBehavior: 'await-reply',
  buildSpawn: () => ({ args: ['acp'] }),
  buildMcpServers: () => [
    { type: 'http', name: 'ptah', url: 'http://localhost:51820/agent/a-1/workspace/w', headers: [] },
  ],
};

/** A transport that never writes `session/cancel` (stdin stopped draining). */
function stallsCancel(agent: FakeAcpAgent): FakeAcpTransport {
  const inner = createFakeAcpTransport(agent);
  const writer = inner.stream.writable.getWriter();
  const decoder = new TextDecoder();
  return {
    ...inner,
    stream: {
      readable: inner.stream.readable,
      writable: new WritableStream<Uint8Array>({
        write: (chunk) =>
          decoder.decode(chunk).includes('session/cancel')
            ? new Promise<void>(() => undefined)
            : writer.write(chunk),
      }),
    },
    get killCount() {
      return inner.killCount;
    },
  };
}

const live: FakeAcpAgent[] = [];

function start(setup: {
  options?: Partial<CliCommandOptions>;
  script?: (agent: FakeAcpAgent) => void;
  transport?: (agent: FakeAcpAgent) => FakeAcpTransport;
}): { handle: SdkHandle; agent: FakeAcpAgent; transport: FakeAcpTransport } {
  const agent = createFakeAcpAgent({ sessionId: 'sess-1' });
  live.push(agent);
  setup.script?.(agent);
  const transport = (setup.transport ?? createFakeAcpTransport)(agent);
  const handle = createProviderSessionLaneHandle({
    profile,
    options: {
      task: 'Summarise the repository',
      workingDirectory: process.cwd(),
      ...setup.options,
    },
    command: 'test-agent',
    transportFactory: () => transport,
    logger: createMockLogger() as unknown as Logger,
  });
  return { handle, agent, transport };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

afterEach(async () => {
  await Promise.all(live.splice(0).map((agent) => agent.close()));
});

describe('createProviderSessionLaneHandle — PR #1450 review', () => {
  it('4651900761: a first turn that throws before the task prompt offers no continuation and stops the agent', async () => {
    const attachmentProbe = {
      get: () => undefined,
      waitFor: jest.fn(() => Promise.reject(new Error('probe failed'))),
    };
    const h = start({
      options: { agentId: 'a-1', mcpPort: 51820, mcpToken: 'tok', attachmentProbe },
    });
    await expect(h.handle.done).resolves.toBe(1);
    await settle();
    expect(attachmentProbe.waitFor).toHaveBeenCalled();
    expect(h.handle.supportsContinuation?.()).toBe(false);
    expect(h.agent.received.filter((m) => m.method === 'session/prompt')).toHaveLength(0);
    expect(h.transport.killCount).toBe(1);
  });

  it('4651900741: an interrupt whose cancel could not be written fails the turn (exit 1)', async () => {
    const h = start({
      transport: stallsCancel,
      script: (agent) => agent.handle('session/prompt', () => ({ hold: true })),
    });
    await h.agent.next((m) => m.method === 'session/prompt');
    await settle();
    expect(h.handle.supportsInterrupt?.()).toBe(true);
    await h.handle.interrupt?.();
    // The process was stopped: the lane cannot continue, so this is no
    // healthy interrupted turn.
    await expect(h.handle.done).resolves.toBe(1);
    expect(h.transport.killCount).toBe(1);
    expect(h.handle.supportsContinuation?.()).toBe(false);
  }, 10_000);
});
