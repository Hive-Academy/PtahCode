import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import {
  PLATFORM_TOKENS,
  hasStateStorageReadiness,
  isAsyncStateStorage,
  type IStateStorage,
} from '@ptah-extension/platform-core';

export const HANDOFF_ACK_STORAGE_KEY = 'ptah.handoffAcknowledgements';

const RecordSchema = z.object({
  predecessorTabId: z.string().min(1),
  predecessorSdkId: z.string().min(1).nullable(),
  successorTabId: z.string().min(1),
  successorSdkId: z.string().min(1).nullable(),
  workspaceRoot: z.string().min(1),
  handoffPath: z.string().min(1),
  state: z.enum(['recorded', 'closePending', 'closeCompleted']),
}).strict();
const DocumentSchema = z.object({ schemaVersion: z.literal(1), records: z.array(z.unknown()) }).strict();
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

  private async readState(): Promise<AckDocumentState> {
    if (!this.storage) throw new Error('handoff acknowledgement storage unavailable');
    if (hasStateStorageReadiness(this.storage)) await this.storage.whenReady();
    const raw: unknown = isAsyncStateStorage(this.storage)
      ? await this.storage.getAsync(HANDOFF_ACK_STORAGE_KEY)
      : this.storage.get(HANDOFF_ACK_STORAGE_KEY);
    if (raw === undefined) return { records: [], invalid: [] };
    const parsed = DocumentSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger?.error('Invalid handoff acknowledgement document', new Error('Invalid persisted handoff acknowledgement schema'));
      return { records: [], invalid: [], quarantine: raw };
    }
    const state: AckDocumentState = { records: [], invalid: [] };
    for (const entry of parsed.data.records) {
      const record = RecordSchema.safeParse(entry);
      if (record.success) state.records.push(record.data);
      else state.invalid.push(entry);
    }
    if (state.invalid.length > 0) {
      this.logger?.error('Invalid handoff acknowledgement records kept unchanged', new Error(`${state.invalid.length} invalid handoff acknowledgement record(s)`));
    }
    return state;
  }

  private async read(): Promise<HandoffAckRecord[]> {
    return (await this.readState()).records;
  }

  private async write(state: AckDocumentState): Promise<void> {
    if (state.quarantine !== undefined) {
      // Append, never overwrite: keep the newest MAX_QUARANTINED invalid documents.
      const previous: unknown = isAsyncStateStorage(this.storage!)
        ? await this.storage!.getAsync(HANDOFF_ACK_QUARANTINE_KEY)
        : this.storage!.get(HANDOFF_ACK_QUARANTINE_KEY);
      const kept = Array.isArray(previous) ? previous : previous === undefined ? [] : [previous];
      await this.storage!.update(
        HANDOFF_ACK_QUARANTINE_KEY,
        [...kept, state.quarantine].slice(-MAX_QUARANTINED),
      );
    }
    await this.storage!.update(HANDOFF_ACK_STORAGE_KEY, {
      schemaVersion: 1,
      records: [...this.prune(state.records), ...state.invalid],
    });
  }

  private serialized<T>(action: () => Promise<T>): Promise<T> {
    const next = this.operation.then(action, action);
    this.operation = next;
    return next;
  }

  async findByPredecessor(id: string): Promise<HandoffAckRecord | undefined> {
    return this.serialized(async () => (await this.read()).find(
      (record) => record.predecessorTabId === id || record.predecessorSdkId === id,
    ));
  }

  async findBySuccessor(id: string): Promise<HandoffAckRecord | undefined> {
    return this.serialized(async () => (await this.read()).find(
      (record) => record.successorTabId === id || record.successorSdkId === id,
    ));
  }

  async record(value: HandoffAckRecord): Promise<void> {
    await this.serialized(async () => {
      const state = await this.readState();
      const index = state.records.findIndex((entry) => entry.predecessorTabId === value.predecessorTabId);
      if (index >= 0) {
        const existing = state.records[index];
        if (existing.state !== 'recorded' || existing.successorTabId === value.successorTabId) {
          throw new Error('handoff predecessor already recorded');
        }
        state.records[index] = RecordSchema.parse(value);
      } else {
        state.records.push(RecordSchema.parse(value));
      }
      await this.write(state);
    });
  }

  async compareAndSet(
    predecessorTabId: string,
    expected: HandoffAckRecord['state'],
    patch: Partial<Pick<HandoffAckRecord, 'state' | 'successorSdkId'>>,
  ): Promise<boolean> {
    return this.serialized(async () => {
      const state = await this.readState();
      const { records } = state;
      const index = records.findIndex((entry) => entry.predecessorTabId === predecessorTabId);
      if (index < 0 || records[index].state !== expected) return false;
      records[index] = RecordSchema.parse({ ...records[index], ...patch });
      await this.write(state);
      return true;
    });
  }

  private prune(records: HandoffAckRecord[]): HandoffAckRecord[] {
    let completed = records.filter((record) => record.state === 'closeCompleted').length;
    return records.filter((record) => record.state !== 'closeCompleted' || --completed < 200);
  }
}
