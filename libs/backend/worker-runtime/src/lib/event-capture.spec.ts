import { WorkerEventCapture } from './event-capture';

it('routes only captured events synchronously without assigning sequence numbers', () => {
  const queued: unknown[] = [];
  const capture = new WorkerEventCapture(
    (payload) =>
      typeof payload === 'object' && payload !== null && 'sessionId' in payload
        ? String(payload.sessionId)
        : null,
    (sessionId, event) => queued.push({ sessionId, event }),
  );
  capture.capture('chat:chunk', { sessionId: 's', text: 'hi' });
  capture.capture('worker:turn.begin', { sessionId: 's' });
  capture.capture('chat:chunk', {});
  expect(queued).toEqual([
    {
      sessionId: 's',
      event: { type: 'chat:chunk', payload: { sessionId: 's', text: 'hi' } },
    },
  ]);
  expect(capture.dropped).toBe(1);
});

it('stamps the worker deadline on a captured permission request', () => {
  const queued: Array<{ payload: unknown }> = [];
  const capture = new WorkerEventCapture(
    () => 's',
    (_sessionId, event) => queued.push(event),
  );
  capture.capture('permission:request', {
    id: 'r',
    timestamp: 10,
    timeoutAt: 0,
  });
  capture.capture('chat:chunk', { timestamp: 10, timeoutAt: 0 });
  expect(queued[0].payload).toEqual({
    id: 'r',
    timestamp: 10,
    timeoutAt: 60_010,
  });
  expect(queued[1].payload).toEqual({ timestamp: 10, timeoutAt: 0 });
});
