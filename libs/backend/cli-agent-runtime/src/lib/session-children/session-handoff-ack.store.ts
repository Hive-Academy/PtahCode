import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
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
const DocumentSchema = z.object({ schemaVersion: z.literal(1), records: z.array(RecordSchema) }).strict();
export type HandoffAckRecord = z.infer<typeof RecordSchema>;

@injectable()
export class SessionHandoffAckStore {
  private operation: Promise<unknown> = Promise.resolve();

  constructor(
    @inject(PLATFORM_TOKENS.WORKSPACE_STATE_STORAGE, { isOptional: true })
    private readonly storage: IStateStorage | null = null,
  ) {}

  private async read(): Promise<HandoffAckRecord[]> {
    if (!this.storage) throw new Error('handoff acknowledgement storage unavailable');
    if (hasStateStorageReadiness(this.storage)) await this.storage.whenReady();
    const raw: unknown = isAsyncStateStorage(this.storage)
      ? await this.storage.getAsync(HANDOFF_ACK_STORAGE_KEY)
      : this.storage.get(HANDOFF_ACK_STORAGE_KEY);
    if (raw === undefined) return [];
    return DocumentSchema.parse(raw).records;
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
      const records = await this.read();
      if (records.some((entry) => entry.predecessorTabId === value.predecessorTabId)) {
        throw new Error('handoff predecessor already recorded');
      }
      records.push(RecordSchema.parse(value));
      await this.storage!.update(HANDOFF_ACK_STORAGE_KEY, { schemaVersion: 1, records });
    });
  }

  async compareAndSet(
    predecessorTabId: string,
    expected: HandoffAckRecord['state'],
    patch: Partial<Pick<HandoffAckRecord, 'state' | 'successorSdkId'>>,
  ): Promise<boolean> {
    return this.serialized(async () => {
      const records = await this.read();
      const index = records.findIndex((entry) => entry.predecessorTabId === predecessorTabId);
      if (index < 0 || records[index].state !== expected) return false;
      records[index] = RecordSchema.parse({ ...records[index], ...patch });
      await this.storage!.update(HANDOFF_ACK_STORAGE_KEY, { schemaVersion: 1, records });
      return true;
    });
  }
}
