/**
 * Reads the recorded ACP sessions in this folder (`*.ndjson`, one envelope
 * per line: `{ dir: 'out' | 'in' | 'stderr' | 'exit', msg }`) so a spec can
 * script the fake agent with what a real agent answered. Test-only; uses no
 * jest globals and no SDK runtime value.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AcpFixtureEnvelope {
  readonly dir: 'in' | 'out' | 'stderr' | 'exit';
  readonly msg?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every envelope of `<name>` (e.g. `grok-plain-turn.ndjson`), in order. */
export function readAcpFixture(name: string): AcpFixtureEnvelope[] {
  return fs
    .readFileSync(path.join(__dirname, name), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AcpFixtureEnvelope);
}

/**
 * The agent's recorded `result` for the `nth` (0-based) client request of
 * `method`. Throws when the fixture has none, so a spec never runs on an
 * invented reply.
 */
export function recordedResult(
  fixture: readonly AcpFixtureEnvelope[],
  method: string,
  nth = 0,
): Record<string, unknown> {
  const requests = fixture.filter(
    (envelope) => envelope.dir === 'out' && envelope.msg?.['method'] === method,
  );
  const id = requests[nth]?.msg?.['id'];
  const reply = fixture.find(
    (envelope) =>
      envelope.dir === 'in' &&
      envelope.msg?.['id'] === id &&
      envelope.msg?.['method'] === undefined,
  );
  const result = reply?.msg?.['result'];
  if (id === undefined || !isRecord(result)) {
    throw new Error(`fixture has no recorded result for ${method} #${nth}`);
  }
  return result;
}

/**
 * The `session/update` payloads the agent sent between the client's `nth`
 * request of `method` and the agent's reply to it. Throws when that request
 * is not recorded, has no recorded reply, or a later request of the same
 * method starts before the reply: a window without its own reply would mix
 * in the next request's updates.
 */
export function recordedUpdatesDuring(
  fixture: readonly AcpFixtureEnvelope[],
  method: string,
  nth = 0,
): Array<{ readonly update: unknown; readonly meta?: Record<string, unknown> }> {
  const start = fixture.findIndex(
    (envelope, index) =>
      envelope.dir === 'out' &&
      envelope.msg?.['method'] === method &&
      fixture
        .slice(0, index)
        .filter((earlier) => earlier.dir === 'out' && earlier.msg?.['method'] === method)
        .length === nth,
  );
  if (start < 0) {
    throw new Error(`fixture has no ${method} request #${nth}`);
  }
  const id = fixture[start].msg?.['id'];
  const updates: Array<{ update: unknown; meta?: Record<string, unknown> }> = [];
  for (const envelope of fixture.slice(start + 1)) {
    if (
      envelope.dir === 'in' &&
      envelope.msg?.['id'] === id &&
      envelope.msg?.['method'] === undefined
    ) {
      return updates;
    }
    if (envelope.dir === 'out' && envelope.msg?.['method'] === method) {
      throw new Error(
        `fixture ${method} #${nth} has no recorded reply before the next ${method}`,
      );
    }
    const params = envelope.msg?.['params'];
    if (
      envelope.dir === 'in' &&
      envelope.msg?.['method'] === 'session/update' &&
      isRecord(params)
    ) {
      updates.push({
        update: params['update'],
        ...(isRecord(params['_meta']) ? { meta: params['_meta'] } : {}),
      });
    }
  }
  throw new Error(`fixture ${method} #${nth} has no recorded reply`);
}
