import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger, SubagentRegistryService } from '@ptah-extension/vscode-core';
import { CompactionConfigProvider } from '../compaction-config-provider';
import { SubagentBudgetStopCallbackRegistry } from '../subagent-budget-stop-callback-registry';
import { SubagentBudgetMonitor, type SubagentBudgetDispatcherPort } from './subagent-budget-monitor';
import { SubagentHandoffFiles } from './subagent-handoff-files';
import { SubagentHandoffRecords } from './subagent-handoff-record';
import { SubagentHandoffIndex } from './subagent-handoff-index';
import { SubagentStopNotices } from './subagent-stop-notices';
import { createSubagentBudgetHooks } from './subagent-budget-hooks';
import { readPredecessor } from './subagent-successor-lineage';

const route = { kind: 'native' as const, providerId: 'anthropic' };
const session = 'batch2-session';
function turn(tool: string, model: string, input: number) {
  return { type: 'assistant', parent_tool_use_id: tool, message: { id: tool + input, model, content: [],
    usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } };
}
function spawn(tool: string, prompt: string) {
  return { type: 'assistant', message: { content: [{ type: 'tool_use', id: tool, name: 'Agent', input: { prompt } }] } };
}
async function harness() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ptah-monitor-batch2-'));
  const logger = Object.assign(Object.create(Logger.prototype) as Logger, { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() });
  const config = Object.assign(Object.create(CompactionConfigProvider.prototype) as CompactionConfigProvider, {
    getAgentBudgetSettings: () => ({ handoffContextTokens: 650_000, warnRatio: 0.85, stopWeightedTokens: 3_000_000, maxDurationMin: 90 }),
    getConfig: () => ({ enabled: true }),
  });
  const registry = Object.assign(Object.create(SubagentRegistryService.prototype) as SubagentRegistryService, {
    get: (tool: string) => ({ toolCallId: tool, agentId: tool, taskId: tool, agentType: 'Explore', status: 'running', startedAt: Date.now() }),
    getToolCallIdByAgentId: (agent: string) => agent, update: jest.fn(),
  });
  const dispatcher: SubagentBudgetDispatcherPort = {
    pushParentMessage: jest.fn(async () => undefined),
    postMainThreadNotice: jest.fn(), withdrawMainThreadNotice: () => true,
    postSubagentNotice: jest.fn(), withdrawSubagentNotice: jest.fn(),
  };
  const records = new SubagentHandoffRecords(logger, () => workspace);
  const monitor = new SubagentBudgetMonitor(logger, config, dispatcher, registry, new SubagentHandoffFiles(logger, () => workspace),
    records, new SubagentHandoffIndex(logger), new SubagentBudgetStopCallbackRegistry(logger), new SubagentStopNotices(), async () => undefined);
  await monitor.observe(session, { modelUsage: { small: { contextWindow: 200_000 }, large: { contextWindow: 1_000_000 } } }, route);
  return { workspace, monitor, logger, dispatcher };
}
async function completeNotes(h: Awaited<ReturnType<typeof harness>>, agent: string): Promise<void> {
  const notes = path.join(h.workspace, '.ptah', 'subagent-handoffs', `${agent}.md`);
  await fs.mkdir(path.dirname(notes), { recursive: true });
  await fs.writeFile(notes, 'Completed investigation; continue from these notes.');
  await h.monitor.recordNotesToolResult(session, agent, 'Write', { file_path: notes });
  await h.monitor.finishWarnedAgent(session, agent);
  await h.monitor.recordTaskTerminal(session, agent, 'completed');
  expect(h.monitor.hasNotesGate(agent)).toBe(false);
}
it('writes ancestry through real warned completions and denies the linked next spawn after rekey', async () => {
  const h = await harness();
  try {
    await h.monitor.observe(session, spawn('first', 'inspect source'), route);
    await h.monitor.observe(session, turn('first', 'small', 160_000), route);
    expect(h.monitor.hasNotesGate('first')).toBe(true);
    await completeNotes(h, 'first');
    const directory = path.join(h.workspace, '.ptah', 'subagent-handoffs');
    const first = (await fs.readdir(directory)).find(file => file.endsWith('.handoff.md'));
    if (!first) throw new Error('Missing predecessor record');
    const firstPath = path.join(directory, first);
    await h.monitor.observe(session, spawn('second', `continue\nPtah predecessor handoff: ${firstPath}`), route);
    await h.monitor.observe(session, turn('second', 'small', 160_000), route);
    await completeNotes(h, 'second');
    const second = (await fs.readdir(directory)).find(file => file.endsWith('.handoff.md') && file !== first);
    if (!second) throw new Error('Missing successor record');
    const secondPath = path.join(directory, second);
    const prompt = `continue\nPtah predecessor handoff: ${secondPath}`;
    expect(await readPredecessor(h.workspace, { prompt }, h.logger)).toMatchObject({ exhausted: true, predecessor: firstPath, warningReached: true, effectiveH: 180_000 });
    h.monitor.rekey(session, 'rekeyed');
    const hooks = createSubagentBudgetHooks(h.logger, h.monitor, 'rekeyed');
    const hook = hooks.PreToolUse?.[0]?.hooks[0];
    if (!hook) throw new Error('Missing hook');
    expect(await hook({ hook_event_name: 'PreToolUse', cwd: h.workspace, transcript_path: '', session_id: 'rekeyed', tool_name: 'Agent', tool_input: { prompt }, tool_use_id: 'third' }, undefined, { signal: new AbortController().signal }))
      .toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: expect.stringContaining('lineage exhausted') } });
  } finally { h.monitor.release(session); h.monitor.release('rekeyed'); await fs.rm(h.workspace, { recursive: true, force: true }); }
});
it('resets the effective cap when the subagent assistant model changes', async () => {
  const h = await harness();
  try {
    await h.monitor.observe(session, turn('agent', 'small', 180_000), route);
    expect(h.monitor.getAgentBudgetState('agent', session)).toMatchObject({ handoffTokens: 180_000 });
    expect(h.monitor.getSnapshot(session, 'agent')?.budgetReached).toBe(true);
    await h.monitor.observe(session, turn('agent', 'large', 190_000), route);
    expect(h.monitor.getAgentBudgetState('agent', session)).toMatchObject({ handoffTokens: 650_000 });
    expect(h.monitor.getSnapshot(session, 'agent')?.budgetReached).toBe(false);
  } finally { h.monitor.release(session); await fs.rm(h.workspace, { recursive: true, force: true }); }
});
