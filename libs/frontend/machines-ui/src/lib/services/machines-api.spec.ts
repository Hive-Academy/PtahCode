import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import { MachinesApi } from './machines-api';

describe('MachinesApi', () => {
  let api: MachinesApi;
  let call: jest.Mock;

  beforeEach(() => {
    call = jest.fn().mockResolvedValue({ success: true, data: {} });
    TestBed.configureTestingModule({
      providers: [{ provide: ClaudeRpcService, useValue: { call } }],
    });
    api = TestBed.inject(MachinesApi);
  });

  it.each([
    ['list', () => api.list(), 'machines:list', {}],
    ['sshAliases', () => api.sshAliases(), 'machines:sshAliases', {}],
    ['add', () => api.add('horus'), 'machines:add', { alias: 'horus' }],
    [
      'pair',
      () => api.pair('m', 'ABCD1234'),
      'machines:pair',
      { machineId: 'm', code: 'ABCD1234' },
    ],
    [
      'pairViaSsh',
      () => api.pairViaSsh('m'),
      'machines:pairViaSsh',
      { machineId: 'm' },
    ],
    ['remove', () => api.remove('m'), 'machines:remove', { machineId: 'm' }],
    ['retry', () => api.retry('m'), 'machines:retry', { machineId: 'm' }],
    [
      'readiness',
      () => api.readiness('m'),
      'machines:readiness',
      { machineId: 'm' },
    ],
    [
      'workspaces',
      () => api.workspaces('m'),
      'machines:workspaces',
      { machineId: 'm' },
    ],
    [
      'sessions',
      () => api.sessions('m', 'w'),
      'machines:sessions',
      { machineId: 'm', workspaceId: 'w' },
    ],
    [
      'attach',
      () => api.attach('m', 's'),
      'machines:session.attach',
      { machineId: 'm', sessionId: 's' },
    ],
    [
      'detach',
      () => api.detach('m', 's'),
      'machines:session.detach',
      { machineId: 'm', sessionId: 's' },
    ],
    [
      'replay',
      () => api.replay('m', 's', 7),
      'machines:session.replay',
      { machineId: 'm', sessionId: 's', afterSeq: 7 },
    ],
    [
      'start',
      () => api.start({ machineId: 'm', workspaceId: 'w', prompt: 'hi' }),
      'machines:session.start',
      { machineId: 'm', workspaceId: 'w', prompt: 'hi' },
    ],
    [
      'continue',
      () => api.continue('m', 's', 'more'),
      'machines:session.continue',
      { machineId: 'm', sessionId: 's', prompt: 'more' },
    ],
    [
      'stop',
      () => api.stop('m', 's'),
      'machines:session.stop',
      { machineId: 'm', sessionId: 's' },
    ],
    [
      'respondPermission',
      () =>
        api.respondPermission({
          machineId: 'm',
          sessionId: 's',
          requestId: 'r',
          decision: 'deny',
        }),
      'machines:permission.respond',
      { machineId: 'm', sessionId: 's', requestId: 'r', decision: 'deny' },
    ],
  ] as const)('%s calls %s', async (_name, invoke, method, params) => {
    await invoke();
    expect(call).toHaveBeenCalledWith(method, params);
  });
});
