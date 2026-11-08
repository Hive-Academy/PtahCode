import { TestBed } from '@angular/core/testing';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import {
  MachinesFeed,
  parseMachinesEvent,
  parseMachinesState,
} from './machines-feed';

describe('MachinesFeed', () => {
  let feed: MachinesFeed;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    feed = TestBed.inject(MachinesFeed);
  });

  it('handles exactly the two machines push types', () => {
    expect([...feed.handledMessageTypes]).toEqual([
      'machines:event',
      'machines:state',
    ]);
  });

  it('relays every valid event in delivery order, one call per push', () => {
    const seen: number[] = [];
    feed.onEvent((event) => seen.push(event.seq));
    for (const seq of [1, 2, 2, 3]) {
      feed.handleMessage({
        type: MESSAGE_TYPES.MACHINES_EVENT,
        payload: {
          machineId: 'm',
          sessionId: 's',
          epoch: 'e',
          seq,
          type: 'chat:chunk',
          payload: {},
        },
      });
    }
    expect(seen).toEqual([1, 2, 2, 3]);
  });

  it('drops malformed pushes and other message types', () => {
    const onEvent = jest.fn();
    const onState = jest.fn();
    feed.onEvent(onEvent);
    feed.onState(onState);
    feed.handleMessage({ type: MESSAGE_TYPES.MACHINES_EVENT, payload: {} });
    feed.handleMessage({
      type: MESSAGE_TYPES.MACHINES_STATE,
      payload: { machineId: 'm', state: 'broken' },
    });
    feed.handleMessage({ type: 'something:else', payload: {} });
    expect(onEvent).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
  });

  it('stops relaying after unsubscribe', () => {
    const onState = jest.fn();
    const stop = feed.onState(onState);
    stop();
    feed.handleMessage({
      type: MESSAGE_TYPES.MACHINES_STATE,
      payload: { machineId: 'm', state: 'offline' },
    });
    expect(onState).not.toHaveBeenCalled();
  });
});

describe('parseMachinesEvent', () => {
  const valid = {
    machineId: 'm',
    sessionId: 's',
    epoch: 'e',
    seq: 1,
    type: 'chat:chunk',
    payload: { x: 1 },
  };

  it('accepts a valid event and passes its payload through', () => {
    expect(parseMachinesEvent(valid)).toEqual(valid);
  });

  it.each([
    { ...valid, seq: 0 },
    { ...valid, seq: 1.5 },
    { ...valid, epoch: '' },
    { ...valid, type: 3 },
    [],
  ])('rejects %p', (payload) => {
    expect(parseMachinesEvent(payload)).toBeNull();
  });
});

describe('parseMachinesState', () => {
  it('keeps valid optional fields, including a known reason', () => {
    expect(
      parseMachinesState({
        machineId: 'm',
        state: 'unpaired',
        nextRetryAt: 5,
        lastSeenAt: 4,
        reason: 're-pair-required',
        versions: {
          local: { ptahVersion: '1.0.0', protocol: { min: 1, max: 2 } },
        },
      }),
    ).toEqual({
      machineId: 'm',
      state: 'unpaired',
      nextRetryAt: 5,
      lastSeenAt: 4,
      reason: 're-pair-required',
      versions: {
        local: { ptahVersion: '1.0.0', protocol: { min: 1, max: 2 } },
      },
    });
  });

  it('leaves out malformed optional fields and unknown reasons', () => {
    expect(
      parseMachinesState({
        machineId: 'm',
        state: 'offline',
        nextRetryAt: 'soon',
        reason: 'made-up',
        versions: { local: { ptahVersion: 1 } },
      }),
    ).toEqual({ machineId: 'm', state: 'offline' });
  });
});
