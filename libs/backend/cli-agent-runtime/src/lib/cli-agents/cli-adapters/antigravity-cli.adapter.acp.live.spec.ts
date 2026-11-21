/**
 * Live check of the Antigravity lane on `agy acp` through the real adapter
 * (`AntigravityCliAdapter.runSdk`), TASK_2026_2291 (P3). Skipped unless
 * `PTAH_LIVE_AGY=1`; never runs in CI. Needs a signed-in `agy` >= 1.5.1.
 *
 * - D9: a minimal local HTTP MCP server stands in for Ptah's (which cannot run
 *   inside jest). The lane attaches it as an ACP `http` entry with the lane
 *   bearer; agy must list its tool and call it, and
 *   `~/.gemini/config/mcp_config.json` must be byte-identical afterwards.
 * - Interrupt mid-turn keeps the process; the next message runs on the same pid.
 * - Stopping the lane leaves no process of the agy tree (checked by pid).
 *
 * Run (one spec, no Nx):
 *   PTAH_LIVE_AGY=1 npx jest --config libs/backend/cli-agent-runtime/jest.config.ts \
 *     --runInBand --coverage=false --runTestsByPath \
 *     libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.acp.live.spec.ts
 * `PTAH_RECORD_AGY_FIXTURES=1` also saves each run, redacted, as an
 * `antigravity-p3-*.ndjson` fixture in `libs/backend/acp-runtime/src/lib/__fixtures__/`.
 */
import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir, tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnAcpProcess } from '@ptah-extension/acp-runtime';
import {
  createAcpTeeRecorder,
  createLiveProcessSpawner,
  redactAcpEnvelopes,
  writeAcpFixture,
  type AcpTeeRecorder,
} from '@ptah-extension/acp-runtime/testing';
import type { CliOutputSegment, FlatStreamEventUnion } from '@ptah-extension/shared';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import type { CliCommandOptions, SdkHandle } from './cli-adapter.interface';
import { AntigravityCliAdapter } from './antigravity-cli.adapter';

const LIVE = process.env['PTAH_LIVE_AGY'] === '1';
const RECORD = process.env['PTAH_RECORD_AGY_FIXTURES'] === '1';
const MODEL = process.env['PTAH_AGY_LIVE_MODEL'] || 'gemini-3.8-flash-low';
const MCP_TOKEN = 'live-lane-bearer-7731';
const TOOL_TOKEN = 'TOKEN-ZETA-9917';
const FIXTURES = resolve(__dirname, '../../../../../acp-runtime/src/lib/__fixtures__');
const MCP_CONFIG = join(homedir(), '.gemini', 'config', 'mcp_config.json');

interface McpLog {
  readonly method: string;
  readonly authorization?: string;
}

/** A Streamable-HTTP MCP server with one tool, answering every POST as JSON. */
function startTestMcpServer(): Promise<{ server: Server; port: number; log: McpLog[] }> {
  const log: McpLog[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => {
      if (req.method !== 'POST') {
        res.writeHead(405).end();
        return;
      }
      const message = JSON.parse(body) as {
        id?: number | string;
        method: string;
        params?: { protocolVersion?: string };
      };
      log.push({ method: message.method, authorization: req.headers.authorization });
      if (message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      const reply = (payload: Record<string, unknown>): void => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, ...payload }));
      };
      switch (message.method) {
        case 'initialize':
          reply({
            result: {
              protocolVersion: message.params?.protocolVersion ?? '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: { name: 'ptah-live-test', version: '1' },
            },
          });
          return;
        case 'tools/list':
          reply({
            result: {
              tools: [
                {
                  name: 'ptah_echo_token',
                  description: 'Returns the verification token. Call it when asked for the token.',
                  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                },
              ],
            },
          });
          return;
        case 'tools/call':
          reply({ result: { content: [{ type: 'text', text: TOOL_TOKEN }] } });
          return;
        default:
          reply({ error: { code: -32601, message: 'Method not found' } });
      }
    });
  });
  return new Promise((done) => {
    server.listen(0, () => {
      done({ server, port: (server.address() as AddressInfo).port, log });
    });
  });
}

function fileHash(path: string): string {
  return existsSync(path)
    ? createHash('sha256').update(readFileSync(path)).digest('hex')
    : 'absent';
}

/** Every live pid below `root` (inclusive), from the OS process table. */
function processTree(root: number): number[] {
  const rows =
    process.platform === 'win32'
      ? execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }',
          ],
          { encoding: 'utf8' },
        )
      : execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
  const children = new Map<number, number[]>();
  const alive = new Set<number>();
  for (const row of rows.split(/\r?\n/)) {
    const [pid, ppid] = row.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
    alive.add(pid);
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  if (!alive.has(root)) return [];
  const tree: number[] = [];
  const queue = [root];
  while (queue.length > 0) {
    const pid = queue.shift() as number;
    if (tree.includes(pid)) continue;
    tree.push(pid);
    queue.push(...(children.get(pid) ?? []));
  }
  return tree;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // ESRCH: the process is gone.
    return false;
  }
}

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((settle) => setTimeout(settle, 250));
  }
  return check();
}

interface LaneRun {
  readonly handle: SdkHandle;
  readonly recorder: AcpTeeRecorder;
  readonly segments: CliOutputSegment[];
  readonly stream: FlatStreamEventUnion[];
}

async function startLane(
  cwd: string,
  options: Partial<CliCommandOptions>,
): Promise<LaneRun> {
  const recorder = createAcpTeeRecorder(spawnAcpProcess);
  const adapter = new AntigravityCliAdapter(
    createLiveProcessSpawner(),
    undefined,
    createMockLogger() as unknown as Logger,
    { transportFactory: recorder.factory },
  );
  const detected = await adapter.detect();
  expect(detected.installed).toBe(true);
  expect(adapter.capabilities().messaging.interrupt.state).toBe('supported');
  const handle = await adapter.runSdk({
    task: 'Reply with exactly READY and nothing else.',
    workingDirectory: cwd,
    agentId: 'live-agy-lane',
    model: MODEL,
    ...options,
  });
  const segments: CliOutputSegment[] = [];
  const stream: FlatStreamEventUnion[] = [];
  handle.onSegment?.((segment) => segments.push(segment));
  handle.onStreamEvent?.((event) => stream.push(event));
  return { handle, recorder, segments, stream };
}

function saveFixture(run: LaneRun, name: string, cwd: string): void {
  if (!RECORD) return;
  const literals = [cwd, homedir(), tmpdir(), userInfo().username];
  const replace: Array<[string, string]> = [];
  const placeholders = ['<cwd>', '<home>', '<tmp>', '<user>'];
  literals.forEach((literal, index) => {
    replace.push([literal, placeholders[index]]);
    replace.push([encodeURIComponent(literal), placeholders[index]]);
  });
  replace.push([MCP_TOKEN, '<redacted>']);
  writeAcpFixture(join(FIXTURES, name), redactAcpEnvelopes(run.recorder.envelopes, { replace }));
}

async function stopAndCheckTree(run: LaneRun): Promise<void> {
  const pid = run.handle.getPid?.();
  expect(pid).toBeDefined();
  const tree = processTree(pid as number);
  expect(tree).toContain(pid);
  run.handle.abort.abort();
  await run.handle.done;
  const gone = await waitFor(() => tree.every((member) => !isAlive(member)), 20_000);
  expect(tree.filter(isAlive)).toEqual([]);
  expect(gone).toBe(true);
}

const text = (segments: readonly CliOutputSegment[]): string =>
  segments.flatMap((segment) => (segment.type === 'text' ? [segment.content] : [])).join('');

(LIVE ? describe : describe.skip)('Antigravity lane on agy acp (PTAH_LIVE_AGY=1)', () => {
  let cwd: string;
  beforeAll(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ptah-agy-lane-'));
  });
  afterAll(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('lists and calls a tool of an http MCP entry and leaves mcp_config.json unchanged (D9)', async () => {
    const before = fileHash(MCP_CONFIG);
    const mcp = await startTestMcpServer();
    try {
      const run = await startLane(cwd, {
        task: 'Call the ptah_echo_token MCP tool and reply with exactly the token it returns, nothing else.',
        mcpPort: mcp.port,
        mcpToken: MCP_TOKEN,
      });
      await expect(run.handle.done).resolves.toBe(0);
      const methods = mcp.log.map((entry) => entry.method);
      expect(methods).toEqual(expect.arrayContaining(['initialize', 'tools/list', 'tools/call']));
      expect(mcp.log.every((entry) => entry.authorization === `Bearer ${MCP_TOKEN}`)).toBe(true);
      expect(
        run.segments.some(
          (segment) => segment.type === 'tool-call' && /ptah_echo_token/.test(segment.toolName ?? ''),
        ),
      ).toBe(true);
      expect(text(run.segments)).toContain(TOOL_TOKEN);
      expect(run.stream.some((event) => event.eventType === 'tool_start')).toBe(true);
      expect(run.stream.some((event) => event.eventType === 'text_delta')).toBe(true);
      expect(fileHash(MCP_CONFIG)).toBe(before);
      await stopAndCheckTree(run);
      saveFixture(run, 'antigravity-p3-ptah-mcp-tool-use.ndjson', cwd);
    } finally {
      mcp.server.close();
    }
    expect(fileHash(MCP_CONFIG)).toBe(before);
  }, 300_000);

  it('calls the ptah_lane MCP tool in plan mode, the default lane permission (live F1)', async () => {
    const mcp = await startTestMcpServer();
    try {
      const run = await startLane(cwd, {
        task: 'Call the ptah_echo_token MCP tool and reply with exactly the token it returns, nothing else.',
        mcpPort: mcp.port,
        mcpToken: MCP_TOKEN,
        permission: 'plan',
      });
      await expect(run.handle.done).resolves.toBe(0);
      // Without --dangerously-skip-permissions agy asks before an MCP call
      // (`agy_tool_safety`: unsupported_tool); the lane must grant it.
      const asked = run.recorder.envelopes.filter(
        (envelope) => envelope.dir === 'in' && envelope.msg?.['method'] === 'session/request_permission',
      );
      expect(asked.length).toBeGreaterThan(0);
      for (const request of asked) {
        const params = request.msg?.['params'] as
          | { options?: Array<Record<string, unknown>> }
          | undefined;
        const options = params?.options ?? [];
        const reply = run.recorder.envelopes.find(
          // Our answer: same id, no method (our own requests carry one).
          (envelope) =>
            envelope.dir === 'out' &&
            envelope.msg?.['method'] === undefined &&
            envelope.msg?.['id'] === request.msg?.['id'],
        );
        const chosen = (reply?.msg?.['result'] as { outcome?: { optionId?: string } } | undefined)
          ?.outcome?.optionId;
        expect(options.find((option) => option['optionId'] === chosen)?.['kind']).toMatch(/^allow_/);
      }
      expect(mcp.log.map((entry) => entry.method)).toContain('tools/call');
      const refusals = run.segments.filter((segment) =>
        segment.content.startsWith('Refused permission'),
      );
      expect(refusals).toEqual([]);
      expect(text(run.segments)).toContain(TOOL_TOKEN);
      await stopAndCheckTree(run);
    } finally {
      mcp.server.close();
    }
  }, 300_000);

  it('interrupts mid-turn, keeps the process, runs the next message, and stops the whole tree', async () => {
    const run = await startLane(cwd, {});
    await expect(run.handle.done).resolves.toBe(0);
    const pid = run.handle.getPid?.();
    expect(run.handle.supportsInterrupt?.()).toBe(true);

    const longTurn = await (run.handle.continue as NonNullable<SdkHandle['continue']>)(
      'Run this shell command and wait for it to finish: ' +
        (process.platform === 'win32' ? 'ping -n 90 127.0.0.1' : 'sleep 90') +
        '. Then say DONE.',
    );
    const started = await waitFor(
      () => run.segments.some((segment) => segment.type === 'tool-call'),
      90_000,
    );
    expect(started).toBe(true);
    await run.handle.interrupt?.();
    await expect(longTurn.done).resolves.toBe(0);
    expect(run.handle.getPid?.()).toBe(pid);
    expect(isAlive(pid as number)).toBe(true);

    const marker = run.segments.length;
    const next = await (run.handle.continue as NonNullable<SdkHandle['continue']>)(
      'Reply with exactly AFTER-INTERRUPT and nothing else.',
    );
    await expect(next.done).resolves.toBe(0);
    expect(text(run.segments.slice(marker))).toContain('AFTER-INTERRUPT');
    expect(run.handle.getPid?.()).toBe(pid);

    await stopAndCheckTree(run);
    saveFixture(run, 'antigravity-p3-cancel-then-continue.ndjson', cwd);
  }, 400_000);
});
