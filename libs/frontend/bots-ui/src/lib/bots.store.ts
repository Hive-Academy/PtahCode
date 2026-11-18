import { Injectable, computed, inject, signal } from '@angular/core';
import { ClaudeRpcService, RpcResult } from '@ptah-extension/core';
import {
  BotEditableSchema,
  type BotAvatarGetResult,
  type BotCreateSource,
  type BotDiagnostic,
  type BotEditable,
  type BotLaneTarget,
  type BotRecord,
  type BotRetention,
  type BotScope,
  type BotsListResult,
  type BotsRpcMethods,
  type BotsWriteResult,
} from '@ptah-extension/shared';
import { BotsClient } from './bots-client';
import { BotAvatarCache, type AvatarState } from './bot-avatar-cache';
import {
  avatarErrorMessage,
  botErrorMessage,
  listErrorMessage,
  type BotFailure,
} from './bot-error-messages';
export {
  BOT_AVATAR_CACHE_LIMIT,
  BOT_AVATAR_CACHE_BYTES,
  type AvatarState,
} from './bot-avatar-cache';
export {
  botErrorMessage,
  type BotDomainCode,
  type BotFailure,
} from './bot-error-messages';

export interface BotDraft {
  readonly definition: BotEditable;
  readonly source?: BotCreateSource;
  readonly enabled: boolean;
  readonly revision: number;
}
export interface BotConflict {
  readonly latest: BotRecord;
  readonly mine: BotDraft;
}
export interface BotLaneChoice {
  readonly target: BotLaneTarget;
  readonly label: string;
  readonly available: boolean;
  readonly models: readonly { readonly id: string; readonly name: string }[];
  readonly diagnostics: readonly string[];
}
export type BotBlockedReason =
  'selecting' | 'saving' | 'conflict' | 'archived' | null;
/** JSON-shaped values: object key order is irrelevant; array order is meaningful. */
function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value: unknown, index: number) =>
        deepEqual(value, right[index]),
      )
    );
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a)
    .filter((key) => a[key] !== undefined)
    .sort();
  const otherKeys = Object.keys(b)
    .filter((key) => b[key] !== undefined)
    .sort();
  return (
    keys.length === otherKeys.length &&
    keys.every(
      (key, index) => key === otherKeys[index] && deepEqual(a[key], b[key]),
    )
  );
}
function editable(record: BotRecord): BotEditable {
  const {
    name,
    description,
    instructions,
    scope,
    skills,
    runtime,
    memoryScope,
    toolRequirements,
    triggers,
    approvalRules,
    avatar,
  } = record;
  return {
    name,
    description,
    instructions,
    scope,
    skills,
    runtime,
    memoryScope,
    toolRequirements,
    triggers,
    approvalRules,
    ...(avatar ? { avatar } : {}),
  };
}
function asDraft(record: BotRecord): BotDraft {
  return {
    definition: editable(record),
    enabled: record.enabled,
    revision: record.revision,
  };
}

/** Renderer orchestration only: all ID-based calls use host workspace context. */
@Injectable({ providedIn: 'root' })
export class BotsStore {
  private readonly client = inject(BotsClient);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly _list = signal<BotsListResult | null>(null);
  private readonly _selected = signal<BotRecord | null>(null);
  private readonly _draft = signal<BotDraft | null>(null);
  private readonly _conflict = signal<BotConflict | null>(null);
  private readonly _error = signal<BotFailure | null>(null);
  private readonly _listError = signal<BotFailure | null>(null);
  private readonly _diagnostics = signal<readonly BotDiagnostic[]>([]);
  private readonly _loading = signal(false);
  private readonly _selecting = signal(false);
  private readonly _saving = signal(false);
  private readonly _saveState = signal<
    'pristine' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error'
  >('pristine');
  private readonly _lanes = signal<readonly BotLaneChoice[]>([]);
  private readonly _catalogDiagnostics = signal<readonly string[]>([]);
  private readonly _catalogLoading = signal(false);
  private readonly avatarCache = new BotAvatarCache();
  private readonly _upload = signal<AvatarState | null>(null);
  private readonly _roots = signal<readonly string[]>([]);
  private listSequence = 0;
  private selectionSequence = 0;
  private selectRequestSequence = 0;
  private writeSequence = 0;
  private catalogSequence = 0;
  private uploadSequence = 0;
  private listParams: BotsRpcMethods['bots:list']['params'] | null = null;

  public readonly list = this._list.asReadonly();
  public readonly summaries = computed(() => this._list()?.summaries ?? []);
  /** Diagnostic rows have no application actions. Never merge them into summaries. */
  public readonly unreadable = computed(() => this._list()?.unreadable ?? []);
  public readonly unidentifiedRowNotice = computed(() => {
    const count = this._list()?.unidentifiedRowCount ?? 0;
    return count ? `${count} bot rows could not be identified.` : null;
  });
  public readonly archivedCount = computed(
    () => this._list()?.archivedCount ?? 0,
  );
  public readonly selected = this._selected.asReadonly();
  public readonly draft = this._draft.asReadonly();
  public readonly conflict = this._conflict.asReadonly();
  public readonly error = this._error.asReadonly();
  public readonly listError = this._listError.asReadonly();
  public readonly diagnostics = this._diagnostics.asReadonly();
  public readonly loading = this._loading.asReadonly();
  public readonly selecting = this._selecting.asReadonly();
  public readonly saving = this._saving.asReadonly();
  public readonly saveState = this._saveState.asReadonly();
  public readonly lanes = this._lanes.asReadonly();
  public readonly catalogDiagnostics = this._catalogDiagnostics.asReadonly();
  public readonly catalogLoading = this._catalogLoading.asReadonly();
  public readonly avatars = this.avatarCache.entries;
  public readonly avatarCacheBytes = this.avatarCache.bytes;
  public readonly avatarUpload = this._upload.asReadonly();
  public readonly workspaceRoots = this._roots.asReadonly();
  public readonly requiresCreateScope = computed(
    () => this._roots().length > 1,
  );
  public readonly dirty = computed(() => {
    const draft = this._draft();
    const selected = this._selected();
    return (
      draft !== null &&
      (!selected || !deepEqual(draft.definition, editable(selected)))
    );
  });
  public readonly readonly = computed(
    () =>
      this._selected()?.archivedAt != null ||
      this._saving() ||
      this._selecting(),
  );
  /** Reason ordinary actions are blocked; conflict editing/comparison remains available. */
  public readonly blockedReason = computed<BotBlockedReason>(() => {
    if (this._selecting()) return 'selecting';
    if (this._saving()) return 'saving';
    if (this._conflict()) return 'conflict';
    return this._selected()?.archivedAt != null ? 'archived' : null;
  });
  public readonly validation = computed(() => {
    const draft = this._draft();
    return draft
      ? (BotEditableSchema.safeParse(draft.definition).error?.issues ?? [])
      : [];
  });

  public setWorkspaceRoots(roots: readonly string[]): void {
    this._roots.set([...new Set(roots)]);
  }

  public async load(
    params: BotsRpcMethods['bots:list']['params'],
  ): Promise<void> {
    this.listParams = params;
    const token = ++this.listSequence;
    this._loading.set(true);
    const result = await this.safe(() => this.client.list(params));
    if (token !== this.listSequence) return;
    this._loading.set(false);
    if (result.isSuccess()) {
      this._list.set(result.data);
      this._listError.set(null);
    } else
      this._listError.set({
        code: result.errorCode,
        message: listErrorMessage(result.errorCode),
      });
  }
  public async refresh(): Promise<void> {
    if (this.listParams) await this.load(this.listParams);
  }

  /** Caller confirms discard before selecting another bot; refresh never changes the draft. */
  public async select(id: string): Promise<void> {
    if (this._selected()?.id === id && this.dirty()) return;
    const token = ++this.selectRequestSequence;
    this._selecting.set(true);
    const result = await this.safe(() => this.client.get({ id }));
    if (token !== this.selectRequestSequence) return;
    this._selecting.set(false);
    if (result.isSuccess()) {
      ++this.selectionSequence;
      this.invalidateEditor();
      this.accept(result.data.record);
      this._diagnostics.set(result.data.diagnostics);
    } else this.fail(result);
  }
  public newDraft(scope?: BotScope, source?: BotCreateSource): boolean {
    const root = this._roots()[0];
    if (!scope && (this.requiresCreateScope() || !root)) {
      this._error.set({ message: 'Choose an explicit scope for the new bot.' });
      return false;
    }
    const resolved =
      scope ??
      (root ? { kind: 'workspace' as const, workspaceRoot: root } : undefined);
    if (!resolved) return false;
    ++this.selectionSequence;
    this.invalidateEditor();
    this._selected.set(null);
    this._draft.set({
      definition: {
        name: '',
        description: '',
        instructions: '',
        scope: resolved,
        skills: [],
        runtime: { kind: 'default' },
        memoryScope: { kind: 'private' },
        toolRequirements: { allow: [], deny: [] },
        triggers: [],
        approvalRules: { mode: 'ask' },
      },
      enabled: false,
      revision: 0,
      ...(source ? { source } : {}),
    });
    return true;
  }
  public patchDraft(patch: Partial<BotEditable>): void {
    const draft = this._draft();
    if (!draft || this.readonly()) return;
    const scopeChanged =
      patch.scope !== undefined &&
      !deepEqual(patch.scope, draft.definition.scope);
    if ('avatar' in patch || 'scope' in patch) {
      ++this.uploadSequence;
      this._upload.set(null);
    }
    this._draft.update((d) =>
      d ? { ...d, definition: { ...d.definition, ...patch } } : d,
    );
    if (scopeChanged) {
      this._draft.update((d) =>
        d?.definition.avatar?.kind === 'image' &&
        d.definition.avatar.imageId === this.avatarCache.stagedImageId
          ? { ...d, definition: { ...d.definition, avatar: undefined } }
          : d,
      );
      this.avatarCache.clearStaged();
    }
    const mine = this._draft();
    this._conflict.update((conflict) =>
      conflict && mine ? { ...conflict, mine } : conflict,
    );
    this._saveState.set(
      this._conflict() ? 'conflict' : this.dirty() ? 'dirty' : 'pristine',
    );
  }
  public discard(): void {
    ++this.selectionSequence;
    this.invalidateEditor();
    const record = this._selected();
    this._draft.set(record ? asDraft(record) : null);
  }
  public async save(): Promise<void> {
    const draft = this._draft();
    if (!draft || this.readonly() || this._conflict()) return;
    if (this.validation().length) {
      this._saveState.set('error');
      return;
    }
    const selected = this._selected();
    await this.write(
      () =>
        selected
          ? this.client.update({
              id: selected.id,
              expectedRevision: draft.revision,
              schemaVersion: 2,
              definition: draft.definition,
            })
          : this.client.create({
              schemaVersion: 2,
              definition: draft.definition,
              ...(draft.source ? { source: draft.source } : {}),
            }),
      false,
    );
  }
  public async setEnabled(enabled: boolean): Promise<void> {
    const selected = this._selected();
    const draft = this._draft();
    if (!selected || !draft || this.readonly() || this._conflict()) return;
    await this.write(
      () =>
        this.client.setEnabled({
          id: selected.id,
          expectedRevision: draft.revision,
          enabled,
        }),
      true,
    );
  }
  public async resubmitConflict(): Promise<void> {
    const conflict = this._conflict();
    if (!conflict || !this._draft() || this.readonly()) return;
    this._draft.update((d) =>
      d
        ? {
            ...d,
            revision: conflict.latest.revision,
            enabled: conflict.latest.enabled,
          }
        : d,
    );
    this._conflict.set(null);
    this._saveState.set(this.dirty() ? 'dirty' : 'pristine');
    await this.save();
  }
  public loadConflictLatest(): void {
    const conflict = this._conflict();
    if (conflict) {
      this.invalidateEditor();
      this.accept(conflict.latest);
    }
  }
  public async archive(): Promise<void> {
    await this.lifecycle('archive');
  }
  public async restore(): Promise<void> {
    await this.lifecycle('restore');
  }
  public async delete(retention: BotRetention): Promise<void> {
    const record = this._selected();
    if (!record || this._saving()) return;
    const token = ++this.writeSequence;
    const selection = this.selectionSequence;
    this._saving.set(true);
    const result = await this.safe(() =>
      this.client.delete({
        id: record.id,
        expectedRevision: record.revision,
        retention,
      }),
    );
    if (token !== this.writeSequence || selection !== this.selectionSequence) {
      if (result.isSuccess()) await this.refresh();
      return;
    }
    this._saving.set(false);
    if (result.isSuccess()) {
      this._selected.set(null);
      this.discard();
      await this.refresh();
    } else {
      this.fail(result);
      await this.checkConflict(result.errorCode, record.id, selection);
    }
  }
  private async lifecycle(action: 'archive' | 'restore'): Promise<void> {
    const record = this._selected();
    if (!record || this._saving()) return;
    await this.write(
      () =>
        this.client[action]({
          id: record.id,
          expectedRevision: record.revision,
        }),
      false,
    );
  }
  private async write(
    request: () => Promise<RpcResult<BotsWriteResult>>,
    rebase: boolean,
  ): Promise<void> {
    const token = ++this.writeSequence;
    const selection = this.selectionSequence;
    this._saving.set(true);
    this._saveState.set('saving');
    const result = await this.safe(request);
    if (token !== this.writeSequence || selection !== this.selectionSequence) {
      if (result.isSuccess()) await this.refresh();
      return;
    }
    this._saving.set(false);
    if (result.isSuccess()) {
      const record = result.data.record;
      if (rebase) {
        this._selected.update((old) =>
          old
            ? { ...old, enabled: record.enabled, revision: record.revision }
            : old,
        );
        this._draft.update((d) =>
          d ? { ...d, enabled: record.enabled, revision: record.revision } : d,
        );
      } else this.accept(record);
      this._diagnostics.set(result.data.diagnostics);
      this._error.set(null);
      this._saveState.set(this.dirty() ? 'dirty' : 'saved');
      await this.refresh();
    } else {
      this.fail(result);
      this._saveState.set('error');
      const id = this._selected()?.id;
      if (id) await this.checkConflict(result.errorCode, id, selection);
    }
  }
  private async checkConflict(
    code: string | undefined,
    id: string,
    selection: number,
  ): Promise<void> {
    if (code !== 'BOT_REVISION_CONFLICT') return;
    const write = this.writeSequence;
    const latest = await this.safe(() => this.client.get({ id }));
    if (selection !== this.selectionSequence || write !== this.writeSequence)
      return;
    const mine = this._draft();
    if (latest.isSuccess() && mine) {
      this._conflict.set({ latest: latest.data.record, mine });
      this._saveState.set('conflict');
    } else this.fail(latest);
  }
  private accept(record: BotRecord): void {
    this.avatarCache.clearStaged();
    this._selected.set(record);
    this._draft.set(asDraft(record));
    this._conflict.set(null);
    this._error.set(null);
    this._saveState.set('pristine');
  }
  private invalidateEditor(): void {
    ++this.selectRequestSequence;
    this._selecting.set(false);
    this.avatarCache.clearStaged();
    ++this.writeSequence;
    ++this.uploadSequence;
    this._saving.set(false);
    this._upload.set(null);
    this._conflict.set(null);
    this._diagnostics.set([]);
    this._error.set(null);
    this._saveState.set('pristine');
  }

  public async loadLaneChoices(): Promise<void> {
    const token = ++this.catalogSequence;
    this._catalogLoading.set(true);
    try {
      const [detected, models, ptah] = await Promise.all([
        this.safe(() => this.rpc.call('agent:detectClis', undefined)),
        this.safe(() => this.rpc.call('agent:listCliModels', undefined)),
        this.safe(() => this.rpc.call('ptahCli:list', {})),
      ]);
      const diagnostics: string[] = [];
      if (!detected.success)
        diagnostics.push(
          'CLI discovery unavailable. Retry loading runtime choices.',
        );
      if (!models.success)
        diagnostics.push(
          'System CLI model catalog unavailable. Retry loading runtime choices.',
        );
      if (!ptah.success)
        diagnostics.push(
          'Ptah CLI registry unavailable. Retry loading runtime choices.',
        );
      if (token !== this.catalogSequence) return;
      const choices: BotLaneChoice[] = [];
      if (detected.isSuccess())
        for (const cli of detected.data.clis) {
          if (cli.cli === 'ptah-cli') continue;
          const options = models.isSuccess()
            ? (models.data[cli.cli] ?? [])
            : [];
          choices.push({
            target: { kind: 'system', cli: cli.cli },
            label: cli.cli,
            available: cli.installed,
            models: options,
            diagnostics: options.some((m) => m.isFallback)
              ? ['Model catalog is using fallback data.']
              : [],
          });
        }
      if (ptah.isSuccess()) {
        const rows = await Promise.all(
          ptah.data.agents.map(async (agent) => {
            const result = await this.safe(() =>
              this.rpc.call('ptahCli:listModels', { id: agent.id }),
            );
            return {
              target: { kind: 'ptah-cli' as const, ptahCliId: agent.id },
              label: agent.name,
              available: agent.enabled && agent.hasApiKey,
              models: result.isSuccess() ? result.data.models : [],
              diagnostics:
                !result.isSuccess() || result.data.error
                  ? [
                      'Model catalog unavailable. Retry loading runtime choices.',
                    ]
                  : [],
            };
          }),
        );
        choices.push(...rows);
      }
      if (token !== this.catalogSequence) return;
      this._lanes.set(choices);
      this._catalogDiagnostics.set(diagnostics);
    } catch (error: unknown) {
      // degradation-audit: reported - the failure is shown to the user in catalogDiagnostics.
      if (token !== this.catalogSequence) return;
      const reason =
        error instanceof Error
          ? 'Runtime catalog could not be read.'
          : 'Runtime catalog returned invalid data.';
      this._catalogDiagnostics.set([
        reason + ' Retry loading runtime choices.',
      ]);
    } finally {
      if (token === this.catalogSequence) this._catalogLoading.set(false);
    }
  }

  public async uploadAvatar(
    params: Omit<BotsRpcMethods['bots:upload-avatar']['params'], 'scope'> & {
      scope?: BotScope;
    },
  ): Promise<void> {
    const draft = this._draft();
    if (!draft || this.readonly()) return;
    const token = ++this.uploadSequence;
    this._upload.set({ status: 'loading' });
    const result = await this.safe(() =>
      this.client.uploadAvatar({ ...params, scope: draft.definition.scope }),
    );
    if (token !== this.uploadSequence) return;
    if (!result.isSuccess()) {
      this._upload.set({
        status: 'error',
        error: {
          code: result.errorCode,
          message: avatarErrorMessage(result.errorCode, 'upload'),
        },
      });
      return;
    }
    if (this._saving()) {
      this._upload.set({
        status: 'error',
        error: {
          message:
            'The avatar was not applied because a save is in progress. Retry the upload after saving finishes.',
        },
      });
      return;
    }
    const state: AvatarState = {
      status: 'ready',
      dataUrl: `data:${params.mediaType};base64,${params.dataBase64}`,
    };
    this.avatarCache.stage(result.data.imageId, state);
    this._upload.set(state);
    this._draft.update((d) =>
      d
        ? {
            ...d,
            definition: {
              ...d.definition,
              avatar: { kind: 'image', imageId: result.data.imageId },
            },
          }
        : d,
    );
    this._saveState.set(
      this._conflict() ? 'conflict' : this.dirty() ? 'dirty' : 'pristine',
    );
  }
  public async loadAvatar(
    botId: string,
    imageId: string,
    retry = false,
  ): Promise<void> {
    if (!retry && this.avatarCache.entries().has(imageId)) return;
    const token = this.avatarCache.beginLoad(imageId);
    const result: RpcResult<BotAvatarGetResult> = await this.safe(() =>
      this.client.getAvatar({ botId, imageId }),
    );
    this.avatarCache.finishLoad(
      imageId,
      token,
      result.isSuccess()
        ? {
            status: 'ready',
            dataUrl: `data:${result.data.mediaType};base64,${result.data.dataBase64}`,
          }
        : {
            status: 'error',
            error: {
              code: result.errorCode,
              message: avatarErrorMessage(result.errorCode, 'load'),
            },
          },
    );
  }
  private fail(result: { errorCode?: string }): void {
    this._error.set({
      code: result.errorCode,
      message: botErrorMessage(result.errorCode),
    });
  }
  private async safe<T>(
    request: () => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    try {
      return await request();
    } catch (error: unknown) {
      return new RpcResult<T>(
        false,
        undefined,
        error instanceof Error ? error.message : 'Transport unavailable',
      );
    }
  }
}
