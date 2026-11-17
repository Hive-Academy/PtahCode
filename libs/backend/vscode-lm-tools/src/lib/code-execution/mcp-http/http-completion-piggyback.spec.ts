import 'reflect-metadata';
import * as http from 'node:http';
import * as net from 'node:net';
import { Logger } from '@ptah-extension/vscode-core';
import type { ExternalOwnerKey } from '@ptah-extension/shared';
import { ExternalCompletionOutbox } from '@ptah-extension/cli-agent-runtime';
import { prepareHttpCompletion } from './http-completion-piggyback';

const owner: ExternalOwnerKey = { transport: 'http', principal: 'a'.repeat(32), exclusive: true };
const other: ExternalOwnerKey = { ...owner, principal: 'b'.repeat(32) };
const response = { jsonrpc: '2.0' as const, id: 1, result: { content: [{ type: 'text', text: 'tool' }] } };
const logger: Logger = Object.assign(Object.create(Logger.prototype), { info: jest.fn() });

function entry(id: string, forOwner = owner) {
  return { completionId: `${id}:done`, agentId: id, owner: forOwner, body: `<agent-lane-completed>${id}</agent-lane-completed>`, completedAt: 'done', recordedAt: Date.now() };
}

function wire(): http.ServerResponse {
  return new http.ServerResponse(new http.IncomingMessage(new net.Socket()));
}

describe('HTTP completion piggyback', () => {
  it('delivers once after a successful response and never crosses owners', () => {
    const box = new ExternalCompletionOutbox(logger);
    box.record(entry('one'));
    expect(prepareHttpCompletion(response, 'tools/call', other, box).response).toEqual(response);
    const pending = prepareHttpCompletion(response, 'tools/call', owner, box);
    expect(JSON.stringify(pending.response)).toContain('<agent-lane-completed>one');
    expect(box.pendingCount(owner)).toBe(1);
    const res = wire();
    pending.finish(res);
    res.emit('finish');
    expect(box.pendingCount(owner)).toBe(0);
    expect(prepareHttpCompletion(response, 'tools/call', owner, box).response).toEqual(response);
  });

  it('does not deliver to a shared credential or a hosted request', () => {
    const box = new ExternalCompletionOutbox(logger);
    box.record(entry('one'));
    expect(prepareHttpCompletion(response, 'tools/call', { ...owner, exclusive: false }, box).response).toEqual(response);
    expect(prepareHttpCompletion(response, 'tools/call', undefined, box).response).toEqual(response);
    expect(prepareHttpCompletion(response, 'tools/list', owner, box).response).toEqual(response);
    expect(box.pendingCount(owner)).toBe(1);
  });

  it('releases a claim on failed write', () => {
    const box = new ExternalCompletionOutbox(logger);
    box.record(entry('one'));
    const pending = prepareHttpCompletion(response, 'tools/call', owner, box);
    const res = wire();
    pending.finish(res);
    res.emit('close');
    expect(box.pendingCount(owner)).toBe(1);
    expect(JSON.stringify(prepareHttpCompletion(response, 'tools/call', owner, box).response)).toContain('one');
  });

  it('limits the number and total bytes in one reply', () => {
    const box = new ExternalCompletionOutbox(logger);
    for (let i = 0; i < 6; i++) box.record({ ...entry(String(i)), body: 'x'.repeat(5000) });
    const pending = prepareHttpCompletion(response, 'tools/call', owner, box);
    const result = pending.response.result;
    expect(result).toMatchObject({ content: expect.arrayContaining([{ type: 'text', text: 'tool' }]) });
    expect(JSON.stringify(result).length).toBeLessThan(21000);
    pending.release();
  });

  it('appends four small entries and leaves two pending', () => {
    const box = new ExternalCompletionOutbox(logger);
    for (let i = 0; i < 6; i++) box.record(entry(String(i)));
    const pending = prepareHttpCompletion(response, 'tools/call', owner, box);
    const serialized = JSON.stringify(pending.response);
    expect((serialized.match(/Completion ID:/g) ?? [])).toHaveLength(4);
    pending.finish(wire());
    pending.release();
    expect(box.pendingCount(owner)).toBe(6);
  });

  it('truncates an oversized UTF-8 body at a character boundary and includes its id', () => {
    const box = new ExternalCompletionOutbox(logger);
    const suffix = '\n[Completion truncated; call ptah_agent_read for full output.]';
    const boundary = 16 * 1024 - Buffer.byteLength(suffix);
    box.record({ ...entry('wide'), body: 'x'.repeat(boundary - 1) + '€' + 'z'.repeat(100) });
    const pending = prepareHttpCompletion(response, 'tools/call', owner, box);
    const serialized = JSON.stringify(pending.response);
    expect(serialized).toContain('Completion ID: wide:done');
    expect(serialized).toContain('[Completion truncated; call ptah_agent_read for full output.]');
    expect(serialized).not.toContain('�');
    pending.release();
  });

  it('claims disjoint entries for concurrent replies', () => {
    const box = new ExternalCompletionOutbox(logger);
    for (let i = 0; i < 5; i++) box.record(entry(String(i)));
    const first = prepareHttpCompletion(response, 'tools/call', owner, box);
    const second = prepareHttpCompletion(response, 'tools/call', owner, box);
    const firstText = JSON.stringify(first.response);
    const secondText = JSON.stringify(second.response);
    expect((firstText.match(/Completion ID:/g) ?? [])).toHaveLength(4);
    expect(secondText).toContain('Completion ID: 4:done');
    expect(firstText).not.toContain('Completion ID: 4:done');
    const firstRes = wire();
    const secondRes = wire();
    first.finish(firstRes);
    second.finish(secondRes);
    firstRes.emit('finish');
    secondRes.emit('finish');
    expect(box.pendingCount(owner)).toBe(0);
  });
});
