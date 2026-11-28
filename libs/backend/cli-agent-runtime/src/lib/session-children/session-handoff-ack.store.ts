import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import {
  PLATFORM_TOKENS,
  hasStateStorageReadiness,
  isAsyncStateStorage,
  type IStateStorage,
} from '@ptah-extension/platform-core';
import {
  compareAckMatches,
  defaultStorage,
  storageCandidates,
  storageForRoot,
} from './session-handoff-ack.storage-candidates';

export const HANDOFF_ACK_STORAGE_KEY = 'ptah.handoffAcknowledgements';

const RecordSchema = z
  .object({
    predecessorTabId: z.string().min(1),
    predecessorSdkId: z.string().min(1).nullable(),
    successorTabId: z.string().min(1),
    successorSdkId: z.string().min(1).nullable(),
    workspaceRoot: z.string().min(1),
    handoffPath: z.string().min(1),
    state: z.enum(['starting', 'recorded', 'closePending', 'closeCompleted']),
    /** Set when the predecessor holds results the successor never adopted: an ack must not close it. */
    keepPredecessor: z.boolean().optional(),
    /** Runtime whose close must succeed before the predecessor can be retired. */
    runtimeClosePending: z
      .enum(['codex-app-server', 'provider-session'])
      .optional(),
    /** The adapter finished closing the runtime, but the tab still needs retirement. */
    runtimeCloseSucceeded: z.literal(true).optional(),
    generation: z.number().int().nonnegative().optional(),
  })
  .strict();
const DocumentSchema = z
  .object({ schemaVersion: z.literal(1), records: z.array(z.unknown()) })
  .strict();
export type HandoffAckRecord = z.infer<typeof RecordSchema>;

/** Invalid documents are appended here (newest last) before they are replaced. */
export const HANDOFF_ACK_QUARANTINE_KEY = `${HANDOFF_ACK_STORAGE_KEY}.quarantine`;
const MAX_QUARANTINED = 5;

interface AckDocumentState {
  records: HandoffAckRecord[];
  /** Entries that failed validation. Written back unchanged so no data is lost. */
  invalid: unknown[];
  /** The raw document when it was invalid as a whole, quarantined on the next write. */
  quarantine?: unknown;
}

interface AckMatch {
  record: HandoffAckRecord;
  state: AckDocumentState;
  storage: IStateStorage;
  index: number;
  pinned: boolean;
}

@injectable()
export class SessionHandoffAckStore {
  private operation: Promise<unknown> = Promise.resolve();

  constructor(
    @inject(PLATFORM_TOKENS.WORKSPACE_STATE_STORAGE, { isOptional: true })
    private readonly storage: IStateStorage | null = null,
    @inject(TOKENS.LOGGER, { isOptional: true })
    private readonly logger: Logger | null = null,
  ) {}

  private async readState(
    storage: IStateStorage | null = this.storage,
  ): Promise<AckDocumentState> {
    if (!storage)
      throw new Error('handoff acknowledgement storage unavailable');
    if (hasStateStorageReadiness(storage)) await storage.whenReady();
    const raw: unknown = isAsyncStateStorage(storage)
      ? await storage.getAsync(HANDOFF_ACK_STORAGE_KEY)
      : storage.get(HANDOFF_ACK_STORAGE_KEY);
    if (raw === undefined) return { records: [], invalid: [] };
    const parsed = DocumentSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger?.error(
        'Invalid handoff acknowledgement document',
        new Error('Invalid persisted handoff acknowledgement schema'),
      );
      return { records: [], invalid: [], quarantine: raw };
    }
    const state: AckDocumentState = { records: [], invalid: [] };
    for (const entry of parsed.data.records) {
      const record = RecordSchema.safeParse(entry);
      if (record.success) state.records.push(record.data);
      else state.invalid.push(entry);
    }
    if (state.invalid.length > 0) {
      this.logger?.error(
        'Invalid handoff acknowledgement records kept unchanged',
        new Error(
          `${state.invalid.length} invalid handoff acknowledgement record(s)`,
        ),
      );
    }
    return state;
  }

  private async write(
    state: AckDocumentState,
    storage: IStateStorage | null = this.storage,
  ): Promise<void> {
    if (!storage)
      throw new Error('handoff acknowledgement storage unavailable');
    if (state.quarantine !== undefined) {
      // Append, never overwrite: keep the newest MAX_QUARANTINED invalid documents.
      const previous: unknown = isAsyncStateStorage(storage)
        ? await storage.getAsync(HANDOFF_ACK_QUARANTINE_KEY)
        : storage.get(HANDOFF_ACK_QUARANTINE_KEY);
      const kept = Array.isArray(previous)
        ? previous
        : previous === undefined
          ? []
          : [previous];
      await storage.update(
        HANDOFF_ACK_QUARANTINE_KEY,
        [...kept, state.quarantine].slice(-MAX_QUARANTINED),
      );
    }
    await storage.update(HANDOFF_ACK_STORAGE_KEY, {
      schemaVersion: 1,
      records: [...this.prune(state.records), ...state.invalid],
    });
  }

  private serialized<T>(action: () => Promise<T>): Promise<T> {
    const next = this.operation.then(action, action);
    this.operation = next;
    return next;
  }

  private storageFor(workspaceRoot: string): IStateStorage | null {
    if (!this.storage) return null;
    const pinned = storageForRoot(this.storage, workspaceRoot);
    if (pinned) return pinned;
    // An unregistered root belongs in the stable default document when available.
    this.logger?.warn(
      `Handoff acknowledgement workspace storage unavailable for ${workspaceRoot}; using default storage when available`,
    );
    return defaultStorage(this.storage) ?? this.storage;
  }

  private async locate(
    predicate: (record: HandoffAckRecord) => boolean,
    complete = false,
    requireValid = false,
  ): Promise<AckMatch | undefined> {
    if (!this.storage)
      throw new Error('handoff acknowledgement storage unavailable');
    const rootStorage = this.storage;
    let best: AckMatch | undefined;
    for (const { storage, state } of await this.readCandidates(complete, requireValid)) {
      state.records.forEach((record, index) => {
        if (!predicate(record)) return;
        const match = {
          record,
          state,
          storage,
          index,
          pinned: storageForRoot(rootStorage, record.workspaceRoot) === storage,
        };
        if (!best || compareAckMatches(match, best) > 0) best = match;
      });
    }
    return best;
  }

  /**
   * Reads every candidate document. A failed read is logged and skipped,
   * unless `complete` is set: then any failure rejects, because a partial
   * read cannot order a replacement above a hidden record.
   */
  private async readCandidates(
    complete = false,
    requireValid = false,
  ): Promise<{ storage: IStateStorage; state: AckDocumentState }[]> {
    if (!this.storage)
      throw new Error('handoff acknowledgement storage unavailable');
    const available: { storage: IStateStorage; state: AckDocumentState }[] = [];
    let lastError: unknown;
    let failed = false;
    for (const storage of storageCandidates(this.storage)) {
      try {
        const state = await this.readState(storage);
        if (requireValid && (state.quarantine !== undefined || state.invalid.length > 0))
          throw new Error('handoff acknowledgement document contains invalid data');
        available.push({ storage, state });
      } catch (error) {
        failed = true;
        lastError = error;
        this.logger?.error(
          'Handoff acknowledgement lookup skipped an unavailable storage',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    if (failed && (complete || available.length === 0)) throw lastError;
    return available;
  }

  private async stateForPredecessor(id: string): Promise<
    | {
        state: AckDocumentState;
        storage: IStateStorage;
        index: number;
      }
    | undefined
  > {
    // Mutations need every document: with the newer copy unreadable, a stale
    // duplicate would look authoritative. The ack path retries on rejection.
    const found = await this.locate(
      (record) => record.predecessorTabId === id,
      true,
    );
    if (!found) return undefined;
    return { state: found.state, storage: found.storage, index: found.index };
  }

  async findByPredecessor(id: string): Promise<HandoffAckRecord | undefined> {
    return this.serialized(
      async () =>
        (
          await this.locate(
            (record) =>
              record.predecessorTabId === id || record.predecessorSdkId === id,
          )
        )?.record,
    );
  }

  /** Read the authoritative record only when every candidate storage is readable. */
  async statusForPredecessor(
    tabId: string,
    sdkSessionId: string,
    workspaceRoot: string,
  ): Promise<Pick<HandoffAckRecord, 'state' | 'successorSdkId'> | undefined> {
    return this.serialized(async () => {
      const record = (
        await this.locate((entry) => entry.predecessorTabId === tabId, true, true)
      )?.record;
      if (
        !record ||
        record.predecessorSdkId !== sdkSessionId ||
        record.workspaceRoot !== workspaceRoot
      )
        return undefined;
      return { state: record.state, successorSdkId: record.successorSdkId };
    });
  }

  async findBySuccessor(id: string): Promise<HandoffAckRecord | undefined> {
    return this.serialized(async () => {
      const predecessors = new Set<string>();
      for (const { state } of await this.readCandidates()) {
        for (const record of state.records) {
          if (record.successorTabId === id || record.successorSdkId === id)
            predecessors.add(record.predecessorTabId);
        }
      }
      for (const predecessor of predecessors) {
        const current = await this.locate(
          (record) => record.predecessorTabId === predecessor,
        );
        if (
          current?.record.successorTabId === id ||
          current?.record.successorSdkId === id
        )
          return current.record;
      }
      return undefined;
    });
  }

  async records(): Promise<readonly HandoffAckRecord[]> {
    return this.serialized(async () => {
      if (!this.storage)
        throw new Error('handoff acknowledgement storage unavailable');
      const found = new Map<
        string,
        { record: HandoffAckRecord; pinned: boolean }
      >();
      for (const { storage: candidate, state } of await this.readCandidates()) {
        for (const record of state.records) {
          const existing = found.get(record.predecessorTabId);
          const pinned =
            candidate === storageForRoot(this.storage, record.workspaceRoot);
          if (!existing || compareAckMatches({ record, pinned }, existing) > 0)
            found.set(record.predecessorTabId, { record, pinned });
        }
      }
      return [...found.values()].map(({ record }) => record);
    });
  }

  async discardStarting(predecessorTabId: string): Promise<void> {
    await this.serialized(async () => {
      const located = await this.stateForPredecessor(predecessorTabId);
      if (!located) return;
      const { state, storage } = located;
      state.records = state.records.filter(
        (entry) =>
          entry.predecessorTabId !== predecessorTabId ||
          entry.state !== 'starting',
      );
      await this.write(state, storage);
    });
  }

  async record(value: HandoffAckRecord): Promise<void> {
    await this.serialized(async () => {
      const previous = await this.locate(
        (record) => record.predecessorTabId === value.predecessorTabId,
      );
      if (previous) {
        const existing = previous.record;
        const replaceable =
          existing.state === 'recorded' || existing.state === 'starting';
        if (!replaceable || existing.successorTabId === value.successorTabId)
          throw new Error('handoff predecessor already recorded');
      }
      const storage = this.storageFor(value.workspaceRoot);
      const state = await this.readState(storage);
      const index = state.records.findIndex(
        (entry) => entry.predecessorTabId === value.predecessorTabId,
      );
      const generations = (await this.readCandidates(true)).flatMap(
        ({ state }) =>
          state.records
            .filter(
              (entry) => entry.predecessorTabId === value.predecessorTabId,
            )
            .map((entry) => entry.generation ?? 0),
      );
      const written = RecordSchema.parse({
        ...value,
        generation: Math.max(0, ...generations) + 1,
      });
      if (index >= 0) {
        const existing = state.records[index];
        // A `starting` record of another successor is left by a host stop
        // before the start settled. The in-flight reservation stops two live
        // handoffs of one predecessor, so the new attempt can replace it.
        const replaceable =
          existing.state === 'recorded' || existing.state === 'starting';
        if (!replaceable || existing.successorTabId === value.successorTabId) {
          throw new Error('handoff predecessor already recorded');
        }
        state.records[index] = written;
      } else {
        state.records.push(written);
      }
      // Write the new record first: a failure between the two writes leaves a
      // recoverable duplicate instead of losing the handoff.
      await this.write(state, storage);
      if (previous && previous.storage !== storage) {
        try {
          // Remove only the replaced successor from its concrete document.
          const stale = previous.record.successorTabId;
          const prior = await this.readState(previous.storage);
          const kept = prior.records.filter(
            (entry) =>
              entry.predecessorTabId !== value.predecessorTabId ||
              entry.successorTabId !== stale,
          );
          if (kept.length !== prior.records.length) {
            prior.records = kept;
            await this.write(prior, previous.storage);
          }
        } catch (error) {
          this.logger?.error(
            'Handoff acknowledgement stale record cleanup failed; newer record wins',
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    });
  }

  async compareAndSet(
    predecessorTabId: string,
    expected: HandoffAckRecord['state'],
    patch: Partial<
      Pick<
        HandoffAckRecord,
        'state' | 'successorSdkId' | 'keepPredecessor' | 'runtimeClosePending' | 'runtimeCloseSucceeded'
      >
    >,
    expectedSuccessorTabId?: string,
  ): Promise<boolean> {
    return this.serialized(async () => {
      const located = await this.stateForPredecessor(predecessorTabId);
      if (!located || located.state.records[located.index].state !== expected)
        return false;
      const { state, storage, index } = located;
      if (
        expectedSuccessorTabId !== undefined &&
        state.records[index].successorTabId !== expectedSuccessorTabId
      )
        return false;
      state.records[index] = RecordSchema.parse({
        ...state.records[index],
        ...patch,
      });
      await this.write(state, storage);
      return true;
    });
  }

  async transition(
    predecessorTabId: string,
    from: HandoffAckRecord['state'],
    patch: Partial<
      Pick<HandoffAckRecord, 'state' | 'successorSdkId' | 'keepPredecessor'>
    >,
    expectedSuccessorTabId?: string,
  ): Promise<'moved' | 'already' | 'completed' | 'missing' | 'superseded'> {
    return this.serialized(async () => {
      const located = await this.stateForPredecessor(predecessorTabId);
      if (!located) return 'missing';
      const { state, storage, index } = located;
      if (
        expectedSuccessorTabId !== undefined &&
        state.records[index].successorTabId !== expectedSuccessorTabId
      )
        return 'superseded';
      const current = state.records[index].state;
      if (current !== from)
        return current === 'closeCompleted' ? 'completed' : 'already';
      state.records[index] = RecordSchema.parse({
        ...state.records[index],
        ...patch,
      });
      await this.write(state, storage);
      return 'moved';
    });
  }

  private prune(records: HandoffAckRecord[]): HandoffAckRecord[] {
    let completed = records.filter(
      (record) => record.state === 'closeCompleted',
    ).length;
    return records.filter(
      (record) => record.state !== 'closeCompleted' || --completed < 200,
    );
  }
}
