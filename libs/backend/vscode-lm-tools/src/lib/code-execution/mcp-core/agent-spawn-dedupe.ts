import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as path from 'node:path';
import type { z } from 'zod';
import { AgentSpawnArgsSchema } from './agent-spawn-args.schema';

type SpawnArgs = z.infer<typeof AgentSpawnArgsSchema>;
const TTL_MS = 120_000;
const MAX_ENTRIES = 200;
const IN_FLIGHT_MAX_MS = 300_000;
/**
 * Per-request spawn timing marks. The dispatcher allocates one record per
 * `ptah_agent_spawn` call, the agent-namespace builder fills it, and the
 * dispatcher logs it. A sub-step field is a number when that step ran and
 * completed; it stays null when the step was skipped, unwired or failed.
 * `namespaceResolutionMs` remains the total over all namespace steps.
 */
export type AgentSpawnTiming = {
  namespaceResolutionMs: number | null;
  skillsMs: number | null;
  roleMs: number | null;
  guidanceMs: number | null;
  pluginPathsMs: number | null;
};

export const agentSpawnTiming = new AsyncLocalStorage<AgentSpawnTiming>();

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export class AgentSpawnDedupe<T extends { agentId: string }> {
  private readonly entries = new Map<
    string,
    {
      promise: Promise<T>;
      startedAt: number;
      expiresAt: number;
      settled: boolean;
      validation?: Promise<boolean>;
    }
  >();

  async run(
    scope: string,
    root: string,
    args: SpawnArgs,
    start: () => Promise<T>,
    isStillValid?: (result: T) => boolean | Promise<boolean>,
  ): Promise<{ promise: Promise<T>; replay: boolean }> {
    // `force` always starts a new lane, also when the call has an explicit key.
    if (args.force) return { promise: start(), replay: false };
    const workingDirectory = path.resolve(root, args.workingDirectory ?? root);
    const input = {
      scope,
      ...args,
      workingDirectory,
      force: undefined,
    };
    const key = createHash('sha256')
      .update(JSON.stringify(canonical(input)))
      .digest('hex');
    const now = Date.now();
    for (const [digest, entry] of this.entries) {
      if (
        entry.expiresAt <= now ||
        (!entry.settled && now - entry.startedAt >= IN_FLIGHT_MAX_MS)
      ) {
        this.entries.delete(digest);
      }
    }
    const existing = this.entries.get(key);
    if (existing) {
      if (!existing.settled) return { promise: existing.promise, replay: true };
      if (isStillValid) {
        existing.validation ??= existing.promise
          .then(isStillValid)
          .catch(() => {
            // degradation-audit: optional-capability - failed validity check leaves lane state unknown; replay conservatively.
            return true;
          });
        const valid = await existing.validation;
        existing.validation = undefined;
        if (
          valid &&
          this.entries.get(key) === existing &&
          existing.expiresAt > Date.now()
        ) {
          return { promise: existing.promise, replay: true };
        }
        if (this.entries.get(key) === existing) this.entries.delete(key);
        return this.run(scope, root, args, start, isStillValid);
      }
      return { promise: existing.promise, replay: true };
    }
    if (this.entries.size >= MAX_ENTRIES) {
      const oldestSettled = [...this.entries].find(
        ([, entry]) => entry.settled,
      );
      if (oldestSettled) this.entries.delete(oldestSettled[0]);
      else return { promise: Promise.resolve().then(start), replay: false };
    }
    // Schedule the work after insertion so a concurrent request observes this promise.
    const promise = Promise.resolve().then(start);
    const entry = {
      promise,
      startedAt: now,
      expiresAt: Number.POSITIVE_INFINITY,
      settled: false,
      validation: undefined as Promise<boolean> | undefined,
    };
    this.entries.set(key, entry);
    void promise.then(
      () => {
        entry.settled = true;
        if (this.entries.get(key) === entry)
          entry.expiresAt = Date.now() + TTL_MS;
      },
      () => {
        // The caller receives the rejection through the returned promise. This
        // handler only removes the failed reservation so a retry can start.
        if (this.entries.get(key) === entry) this.entries.delete(key);
      },
    );
    return { promise, replay: false };
  }
}
