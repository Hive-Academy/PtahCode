import 'reflect-metadata';
import { Logger } from '@ptah-extension/vscode-core';
import { ExternalCompletionOutbox } from '@ptah-extension/cli-agent-runtime';
import type { ExternalOwnerKey } from '@ptah-extension/shared';
import type { MCPResponse } from './types/mcp-protocol.types';
import { markWaitResponse, prepareCompletion } from './completion-delivery';

const logger = Object.assign(Object.create(Logger.prototype), { info: jest.fn() }) as Logger;
const owner: ExternalOwnerKey = { transport: 'stdio', principal: 'a'.repeat(32), exclusive: true };
const other: ExternalOwnerKey = { ...owner, principal: 'b'.repeat(32) };
const result = (): MCPResponse => ({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'status' }] } });
const completedAt = '2026-11-17T10:20:30.000Z';
const completionId = (id: string) => `${id}:${completedAt}`;
const entry = (id: string, forOwner = owner, body = `body-${id}`) => ({ completionId: completionId(id), agentId: id, owner: forOwner, body, completedAt, recordedAt: Date.now() });

describe('completion preparation', () => {
  it('isolates owners and acknowledges only after write success', () => {
    const box = new ExternalCompletionOutbox(logger);
    box.record(entry('one'));
    expect(prepareCompletion(result(), 'tools/call', other, box).response).toEqual(result());
    const first = prepareCompletion(result(), 'tools/call', owner, box);
    expect(JSON.stringify(first.response)).toContain(`Completion ID: ${completionId('one')}\\nbody-one`);
    expect(box.pendingCount(owner)).toBe(1);
    first.failure();
    const retry = prepareCompletion(result(), 'tools/call', owner, box);
    expect(JSON.stringify(retry.response)).toContain(`Completion ID: ${completionId('one')}`);
    retry.success();
    expect(box.pendingCount(owner)).toBe(0);
  });

  it('does not claim a list, error, or another concurrent response', () => {
    const box = new ExternalCompletionOutbox(logger);
    box.record(entry('one'));
    expect(prepareCompletion(result(), 'tools/list', owner, box).response).toEqual(result());
    expect(prepareCompletion({ ...result(), error: { code: -1, message: 'bad' } }, 'tools/call', owner, box).response).toHaveProperty('error');
    const first = prepareCompletion(result(), 'tools/call', owner, box);
    expect(prepareCompletion(result(), 'tools/call', owner, box).response).toEqual(result());
    first.failure();
  });

  it('suppresses a late record only after successful terminal wait write', () => {
    const box = new ExternalCompletionOutbox(logger);
    const wait = prepareCompletion(markWaitResponse(result(), [completionId('one')]), 'tools/call', owner, box);
    wait.failure();
    box.record(entry('one'));
    expect(box.pendingCount(owner)).toBe(1);
    const delivered = prepareCompletion(markWaitResponse(result(), [completionId('one')]), 'tools/call', owner, box);
    expect(JSON.stringify(delivered.response)).toContain(`Completion ID: ${completionId('one')}`);
    delivered.success();
    box.record(entry('one'));
    expect(box.pendingCount(owner)).toBe(0);
  });

  it('suppresses a record arriving between preparation and successful write', () => {
    const box = new ExternalCompletionOutbox(logger);
    const wait = prepareCompletion(markWaitResponse(result(), [completionId('one')]), 'tools/call', owner, box);
    box.record(entry('one'));
    wait.success();
    expect(box.pendingCount(owner)).toBe(0);
  });

  it('does not consume a running lane on timeout or another owner lane', () => {
    const box = new ExternalCompletionOutbox(logger);
    const wait = prepareCompletion(markWaitResponse(result(), []), 'tools/call', owner, box);
    wait.success();
    box.record(entry('one', other));
    expect(box.pendingCount(other)).toBe(1);
    expect(box.pendingCount(owner)).toBe(0);
  });

  it('settles the fifth terminal completion reported by a successful wait', () => {
    const box = new ExternalCompletionOutbox(logger);
    const ids = ['one', 'two', 'three', 'four', 'five'];
    ids.forEach(id => box.record(entry(id)));
    const wait = prepareCompletion(markWaitResponse(result(), ids.map(completionId)), 'tools/call', owner, box);
    expect(JSON.stringify(wait.response)).not.toContain(completionId('five'));
    wait.success();
    expect(box.pendingCount(owner)).toBe(0);
    const next = prepareCompletion(result(), 'tools/call', owner, box);
    expect(next.response).toEqual(result());
    next.success();
    expect(box.pendingCount(owner)).toBe(0);
  });

  it('settles an over-budget completion reported by the successful wait', () => {
    const box = new ExternalCompletionOutbox(logger);
    box.record(entry('one', owner, 'x'.repeat(16_000)));
    box.record(entry('two', owner, 'y'.repeat(1_000)));
    const wait = prepareCompletion(markWaitResponse(result(), [completionId('one'), completionId('two')]), 'tools/call', owner, box);
    expect(JSON.stringify(wait.response)).not.toContain(completionId('two'));
    wait.success();
    expect(box.pendingCount(owner)).toBe(0);
    const next = prepareCompletion(result(), 'tools/call', owner, box);
    expect(next.response).toEqual(result());
    next.success();
  });

  it('retries an over-budget completion when the wait write fails', () => {
    const box = new ExternalCompletionOutbox(logger);
    for (const id of ['a', 'b', 'c', 'd', 'e']) box.record(entry(id));
    const wait = prepareCompletion(markWaitResponse(result(), [completionId('e')]), 'tools/call', owner, box);
    wait.failure();
    const first = prepareCompletion(result(), 'tools/call', owner, box);
    first.success();
    expect(JSON.stringify(prepareCompletion(result(), 'tools/call', owner, box).response)).toContain(`Completion ID: ${completionId('e')}`);
  });

  it('keeps HTTP isError piggyback behavior and matches stdio block shape', () => {
    const box = new ExternalCompletionOutbox(logger);
    box.record(entry('one'));
    const failedTool = { ...result(), result: { content: [], isError: true } };
    expect(prepareCompletion(failedTool, 'tools/call', owner, box).response).toEqual(failedTool);
    const http = prepareCompletion(failedTool, 'tools/call', owner, box, 'http');
    const stdioBlock = `Completion ID: ${completionId('one')}\nbody-one`;
    expect(JSON.stringify(http.response)).toContain(JSON.stringify(stdioBlock));
    http.failure();
    const stdio = prepareCompletion(result(), 'tools/call', owner, box);
    expect(JSON.stringify(stdio.response)).toContain(JSON.stringify(stdioBlock));
    stdio.failure();
  });
});
