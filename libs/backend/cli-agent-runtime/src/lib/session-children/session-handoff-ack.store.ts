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
  ): Promise<
    | {
        record: HandoffAckRecord;
        state: AckDocumentState;
        storage: IStateStorage;
      }
    | undefined
  > {
    if (!this.storage)
      throw new Error('handoff acknowledgement storage unavailable');
    let first:
      | {
          record: HandoffAckRecord;
          state: AckDocumentState;
          storage: IStateStorage;
        }
      | undefined;
    for (const candidate of storageCandidates(this.storage)) {
      const state = await this.readState(candidate);
      const record = state.records.find(predicate);
      if (!record) continue;
      const match = { record, state, storage: candidate };
      if (storageForRoot(this.storage, record.workspaceRoot) === candidate)
        return match;
      first ??= match;
    }
    return first;
  }

  private async stateForPredecessor(id: string): Promise<
    | {
        state: AckDocumentState;
        storage: IStateStorage;
        index: number;
      }
    | undefined
  > {
    const byId = (record: HandoffAckRecord): boolean =>
      record.predecessorTabId === id;
    const found = await this.locate(byId);
    if (!found) return undefined;
    const pinned = this.storageFor(found.record.workspaceRoot);
    if (pinned && pinned !== found.storage) {
      const pinnedState = await this.readState(pinned);
      const pinnedIndex = pinnedState.records.findIndex(byId);
      if (pinnedIndex >= 0)
        return { state: pinnedState, storage: pinned, index: pinnedIndex };
    }
    // The record lives where it was found (for example an older write to the
    // active document): mutate it in place instead of reporting it missing.
    const index = found.state.records.findIndex(byId);
    return index < 0
      ? undefined
      : { state: found.state, storage: found.storage, index };
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

  async findBySuccessor(id: string): Promise<HandoffAckRecord | undefined> {
    return this.serialized(
      async () =>
        (
          await this.locate(
            (record) =>
              record.successorTabId === id || record.successorSdkId === id,
          )
        )?.record,
    );
  }

  async records(): Promise<readonly HandoffAckRecord[]> {
    return this.serialized(async () => {
      if (!this.storage)
        throw new Error('handoff acknowledgement storage unavailable');
      const found = new Map<
        string,
        { record: HandoffAckRecord; pinned: boolean }
      >();
      for (const candidate of storageCandidates(this.storage)) {
        const state = await this.readState(candidate);
        for (const record of state.records) {
          const existing = found.get(record.predecessorTabId);
          const pinned =
            candidate === storageForRoot(this.storage, record.workspaceRoot);
          if (!existing || (pinned && !existing.pinned))
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
        state.records[index] = RecordSchema.parse(value);
      } else {
        state.records.push(RecordSchema.parse(value));
      }
      // Write the new record first: a failure between the two writes leaves a
      // recoverable duplicate instead of losing the handoff.
      await this.write(state, storage);
      if (previous && previous.storage !== storage) {
        // Re-read the previous concrete document and remove only the replaced successor.
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
      }
    });
  }

  async compareAndSet(
    predecessorTabId: string,
    expected: HandoffAckRecord['state'],
    patch: Partial<
      Pick<HandoffAckRecord, 'state' | 'successorSdkId' | 'keepPredecessor'>
    >,
  ): Promise<boolean> {
    return this.serialized(async () => {
      const located = await this.stateForPredecessor(predecessorTabId);
      if (!located || located.state.records[located.index].state !== expected)
        return false;
      const { state, storage, index } = located;
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
  ): Promise<'moved' | 'already' | 'missing'> {
    return this.serialized(async () => {
      const located = await this.stateForPredecessor(predecessorTabId);
      if (!located) return 'missing';
      const { state, storage, index } = located;
      if (state.records[index].state !== from) return 'already';
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
