import * as fs from 'node:fs';
import * as net from 'node:net';
import { KernelSessionDriverLock } from './kernel-session-driver-lock';
import {
  controlEndpointName,
  controlKeyPath,
  readControlKey,
} from './control-keys';
import { listLocalDriverLocks, requestRelease } from './local-lock-client';
import { ControlEndpoint } from './control-endpoint';

const supported = process.platform === 'linux' || process.platform === 'win32';
const owner = {
  kind: 'desktop' as const,
  hostname: 'local',
  pid: process.pid,
  label: 'local holder',
  acquiredAt: new Date().toISOString(),
  responding: true,
};

function send(value: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(controlEndpointName(process.pid));
    let response = '';
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error('timeout'));
    });
    socket.on('connect', () => socket.write(`${JSON.stringify(value)}\n`));
    socket.on('data', (data: Buffer) => {
      response += data.toString();
      if (response.includes('\n')) {
        socket.destroy();
        resolve(JSON.parse(response.split('\n')[0]));
      }
    });
    socket.on('error', reject);
  });
}

(supported ? describe : describe.skip)(
  'session driver control endpoint',
  () => {
    it('decides an operator release in the gate, not on an earlier liveness read', async () => {
      const lock = new KernelSessionDriverLock();
      const id = `control-race-${process.pid}-${Date.now()}`;
      // A liveness read says idle; an owner arrives before the release step.
      lock.setLiveRecordCheck(() => false);
      const gate = jest.fn(async () => 'in-use' as const);
      lock.setReleaseGate(gate);
      try {
        expect((await lock.acquire(id, owner)).ok).toBe(true);
        expect(await requestRelease(id)).toBe('in-use');
        expect(gate).toHaveBeenCalledWith(id, expect.any(Function));
        expect(lock.held()).toHaveLength(1);
      } finally {
        await lock.dispose();
      }
    });

    it('protects the key, refuses a live record, and releases an orphan', async () => {
      const live = new Set<string>();
      const lock = new KernelSessionDriverLock();
      lock.setLiveRecordCheck((id) => live.has(id));
      const id = `control-${process.pid}-${Date.now()}`;
      live.add(id);
      try {
        expect((await lock.acquire(id, owner)).ok).toBe(true);
        const discovery = readControlKey(process.pid);
        expect(discovery).not.toBeNull();
        if (process.platform !== 'win32')
          expect(fs.statSync(controlKeyPath(process.pid)).mode & 0o777).toBe(
            0o600,
          );
        expect(await send({ cmd: 'list', key: 'wrong' })).toEqual({
          ok: false,
          code: 'BAD_KEY',
        });
        expect(await requestRelease(id)).toBe('in-use');
        expect(
          (await listLocalDriverLocks())
            .flatMap((item) => (item.ok ? item.locks : []))
            .some((item) => item.sessionId === id && item.hasLiveRecord),
        ).toBe(true);
        live.delete(id);
        expect(await requestRelease(id)).toBe('released');
        expect(lock.held()).toHaveLength(0);
      } finally {
        await lock.dispose();
      }
    });

    it('binds the control endpoint again after the last lock leaves with a client still connected', async () => {
      // A Windows named pipe keeps its name while an accepted instance is
      // open, so the next endpoint in this process must wait for the close.
      const first = new KernelSessionDriverLock();
      expect(
        (await first.acquire(`rebind-a-${process.pid}-${Date.now()}`, owner))
          .ok,
      ).toBe(true);
      const client = net.createConnection(controlEndpointName(process.pid));
      client.on('error', () => undefined);
      const clientClosed = new Promise<void>((resolve) =>
        client.once('close', () => resolve()),
      );
      await new Promise<void>((resolve) => client.once('connect', resolve));
      // A request that was answered leaves an accepted pipe instance behind.
      expect(await send({ cmd: 'list', key: 'wrong' })).toEqual({
        ok: false,
        code: 'BAD_KEY',
      });
      const second = new KernelSessionDriverLock();
      try {
        // Rebind at once: the old endpoint's close must be awaited, and the
        // idle client must be ended rather than left to its 500 ms timeout.
        await first.dispose();
        const result = await second.acquire(
          `rebind-b-${process.pid}-${Date.now()}`,
          owner,
        );
        expect(result).toEqual(expect.objectContaining({ ok: true }));
        expect(readControlKey(process.pid)).not.toBeNull();
        await clientClosed;
      } finally {
        client.destroy();
        await first.dispose();
        await second.dispose();
      }
      expect(readControlKey(process.pid)).toBeNull();
    });

    it('leaves the control endpoint when dispose races the first acquisition', async () => {
      const register = ControlEndpoint.register.bind(ControlEndpoint);
      let registering: () => void = () => undefined;
      const called = new Promise<void>((resolve) => (registering = resolve));
      const spy = jest
        .spyOn(ControlEndpoint, 'register')
        .mockImplementation((kind, source) => {
          registering();
          return register(kind, source);
        });
      const lock = new KernelSessionDriverLock();
      try {
        const acquiring = lock.acquire(
          `dispose-race-${process.pid}-${Date.now()}`,
          owner,
        );
        await called;
        await lock.dispose();
        expect((await acquiring).ok).toBe(false);
        expect(lock.held()).toHaveLength(0);
        // No source is left, so the endpoint and its discovery file are gone.
        expect(readControlKey(process.pid)).toBeNull();
      } finally {
        spy.mockRestore();
        await lock.dispose();
      }
      const next = new KernelSessionDriverLock();
      try {
        expect(
          (
            await next.acquire(
              `dispose-next-${process.pid}-${Date.now()}`,
              owner,
            )
          ).ok,
        ).toBe(true);
      } finally {
        await next.dispose();
      }
    });

    it('does not finish dispose until an in-flight registration has settled and left', async () => {
      const register = ControlEndpoint.register.bind(ControlEndpoint);
      let registering: () => void = () => undefined;
      const called = new Promise<void>((resolve) => (registering = resolve));
      let proceed: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (proceed = resolve));
      const spy = jest
        .spyOn(ControlEndpoint, 'register')
        .mockImplementation(async (kind, source) => {
          registering();
          await held;
          return register(kind, source);
        });
      const unregister = jest.spyOn(ControlEndpoint.prototype, 'unregister');
      const lock = new KernelSessionDriverLock();
      try {
        const acquiring = lock.acquire(
          `dispose-wait-${process.pid}-${Date.now()}`,
          owner,
        );
        await called;
        let disposed = false;
        const disposing = lock.dispose().then(() => {
          disposed = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(disposed).toBe(false);
        proceed();
        await disposing;
        // The endpoint bound after dispose began, and is already gone.
        expect(readControlKey(process.pid)).toBeNull();
        expect(unregister).toHaveBeenCalledTimes(1);
        expect((await acquiring).ok).toBe(false);
      } finally {
        proceed();
        spy.mockRestore();
        unregister.mockRestore();
        await lock.dispose();
      }
    });

    it('answers unavailable when the holder drops an operator release unanswered', async () => {
      const lock = new KernelSessionDriverLock();
      const id = `control-drop-${process.pid}-${Date.now()}`;
      lock.setLiveRecordCheck(() => false);
      // The last lock leaves while the request is in flight, which destroys
      // the control connection before any reply is written.
      lock.setReleaseGate(async () => {
        await lock.dispose();
        return 'in-use';
      });
      try {
        expect((await lock.acquire(id, owner)).ok).toBe(true);
        expect(await requestRelease(id)).toBe('unavailable');
      } finally {
        await lock.dispose();
      }
    });
  },
);
