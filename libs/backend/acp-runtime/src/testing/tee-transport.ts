/**
 * Test-only recording seam: wraps an `AcpTransportFactory` so every JSON-RPC
 * line between Ptah and a real ACP agent is captured as a fixture envelope
 * (`{dir: 'out' | 'in' | 'stderr' | 'exit', msg}`, the format
 * `readAcpFixture` reads). Bytes pass through unchanged; recording never
 * alters or delays the session.
 *
 * Fixtures must carry no personal data: {@link redactAcpEnvelopes} replaces
 * the given local paths, bearer tokens and agy's account tier before
 * {@link writeAcpFixture} saves them.
 */
import { writeFileSync } from 'node:fs';
import type {
  AcpProcessTransport,
  AcpSpawnOptions,
  AcpTransportFactory,
} from '../lib/acp-process-transport';
import type { AcpFixtureEnvelope } from '../lib/__fixtures__/acp-fixture-reader';

export interface AcpTeeRecorder {
  /** Wraps `inner` (the real `spawnAcpProcess`) and records into {@link envelopes}. */
  readonly factory: AcpTransportFactory;
  /** Every envelope so far, in wire order per direction. */
  readonly envelopes: readonly AcpFixtureEnvelope[];
}

/** Split a byte stream into lines and hand each parsed JSON line to `onLine`. */
function lineTap(
  onLine: (msg: Record<string, unknown>) => void,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  let pending = '';
  const flushLines = (final: boolean): void => {
    const parts = pending.split('\n');
    pending = final ? '' : (parts.pop() ?? '');
    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;
      try {
        onLine(JSON.parse(line) as Record<string, unknown>);
      } catch {
        // degradation-audit: optional-capability - a non-JSON line (a banner)
        // is kept as text so the recording still shows it.
        onLine({ text: line });
      }
    }
  };
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      flushLines(false);
      controller.enqueue(chunk);
    },
    flush() {
      pending += decoder.decode();
      flushLines(true);
    },
  });
}

export function createAcpTeeRecorder(
  inner: AcpTransportFactory,
): AcpTeeRecorder {
  const envelopes: AcpFixtureEnvelope[] = [];
  const factory: AcpTransportFactory = (
    options: AcpSpawnOptions,
  ): AcpProcessTransport => {
    const transport = inner({
      ...options,
      onStderrLine: (line) => {
        envelopes.push({ dir: 'stderr', msg: { line } });
        options.onStderrLine?.(line);
      },
    });
    const inbound = lineTap((msg) => envelopes.push({ dir: 'in', msg }));
    const outbound = lineTap((msg) => envelopes.push({ dir: 'out', msg }));
    void outbound.readable.pipeTo(transport.stream.writable).catch(() => {
      // degradation-audit: optional-capability - the agent's stdin closed;
      // the runtime sees the same close through its own writes.
    });
    void transport.exited.then((exit) => {
      envelopes.push({ dir: 'exit', msg: { code: exit.code, signal: exit.signal } });
    });
    return {
      stream: {
        readable: transport.stream.readable.pipeThrough(inbound),
        writable: outbound.writable,
      },
      getPid: () => transport.getPid(),
      exited: transport.exited,
      kill: () => transport.kill(),
    };
  };
  return { factory, envelopes };
}

export interface AcpRedaction {
  /** Literal strings (local paths, user names) and their placeholders, e.g. `[homedir, '<home>']`. */
  readonly replace: ReadonlyArray<readonly [string, string]>;
}

const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/g;

function redactString(value: string, redaction: AcpRedaction): string {
  let out = value.replace(BEARER, 'Bearer <redacted>');
  for (const [literal, placeholder] of redaction.replace) {
    if (!literal) continue;
    const variants = new Set([
      literal,
      literal.replace(/\\/g, '/'),
      literal.replace(/\//g, '\\'),
    ]);
    for (const variant of variants) out = out.split(variant).join(placeholder);
  }
  return out;
}

function redactValue(value: unknown, redaction: AcpRedaction, key?: string): unknown {
  // agy's `_meta.antigravity.tier` names the account tier: never recorded.
  if (key === 'tier' && typeof value !== 'boolean') return '<redacted>';
  if (typeof value === 'string') return redactString(value, redaction);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, redaction));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, redactValue(item, redaction, name)]),
    );
  }
  return value;
}

/** A redacted copy; longer literals are replaced first so a home inside a tmp path is not split. */
export function redactAcpEnvelopes(
  envelopes: readonly AcpFixtureEnvelope[],
  redaction: AcpRedaction,
): AcpFixtureEnvelope[] {
  const ordered: AcpRedaction = {
    replace: [...redaction.replace].sort((a, b) => b[0].length - a[0].length),
  };
  return envelopes.map((envelope) => redactValue(envelope, ordered) as AcpFixtureEnvelope);
}

/** Save envelopes as an `.ndjson` fixture (one envelope per line). */
export function writeAcpFixture(
  filePath: string,
  envelopes: readonly AcpFixtureEnvelope[],
): void {
  writeFileSync(
    filePath,
    envelopes.map((envelope) => JSON.stringify(envelope)).join('\n') + '\n',
    'utf8',
  );
}
