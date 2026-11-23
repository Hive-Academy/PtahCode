import {
  DestroyRef,
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  AppStateManager,
  FILE_LINK_OPENER,
  LoggingService,
  VSCodeService,
  rpcCall,
} from '@ptah-extension/core';
import {
  isDocFile,
  isReadableTaskFolderMarkdownName,
  type SessionTaskLinkSummary,
  type TaskDigest,
  type TasksGetArtifactResult,
  type TasksGetDigestParams,
  type TasksGetDigestResult,
  type TasksListFolderEntriesParams,
  type TasksListFolderEntriesResult,
  type TasksReadFolderMarkdownResult,
  type TaskStatus,
} from '@ptah-extension/shared';
import { TasksChangedFeed } from '@ptah-extension/tasks-ui/presentation';
import { ChatStore } from '../../../services/chat.store';
import { SessionOrganizationCache } from '../../../services/session-organization/session-organization-cache.store';
import type { SectionState } from '../../../services/session-inspector';
import { normalizeWorkspaceRoot } from '../../../services/workspace-root';

export interface TaskSectionData {
  readonly lead: { readonly taskId: string; readonly missing: boolean };
  readonly digest: TaskDigest | null;
  readonly task: TaskDigest['task'] | null;
  /** File names from the digest or an independent folder listing when the digest fails. */
  readonly documents: readonly string[];
  /** @deprecated The digest does not provide a workflow stage. */
  readonly stage: null;
  readonly related: readonly {
    readonly taskId: string;
    readonly title: string | null;
    readonly status: TaskStatus | null;
  }[];
}

export type TaskDocumentFailure =
  | Exclude<TasksReadFolderMarkdownResult['state'], 'ready'>
  | 'unavailable'
  | 'not-openable'
  | 'stale';

export type TaskDocumentPreview =
  | { readonly file: string; readonly status: 'loading' | 'ready'; readonly content: string }
  | { readonly file: string; readonly status: 'error'; readonly content: ''; readonly reason: TaskDocumentFailure };

export interface TaskDocumentOpenError {
  readonly file: string;
  readonly reason: TaskDocumentFailure;
}

/** Trailing debounce of `tasks:changed` refreshes. */
const REFRESH_DEBOUNCE_MS = 300;

/** The session's resolved task link; `null` = unknown (section not rendered). */
interface TaskLink {
  readonly lead: SessionTaskLinkSummary;
  readonly related: readonly SessionTaskLinkSummary[];
  readonly workspaceRoot: string | null;
}

/** Lead = the `primary` link, else the most recent `createdAt` (req 17, PM-12). */
function resolveLink(
  tasks: readonly SessionTaskLinkSummary[],
  workspaceRoot: string | null,
): TaskLink | null {
  if (tasks.length === 0) return null;
  const byNewest = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
  const lead = tasks.find((task) => task.role === 'primary') ?? byNewest[0];
  return {
    lead,
    related: byNewest.filter((task) => task !== lead),
    workspaceRoot,
  };
}

function sameLink(a: TaskLink | null, b: TaskLink | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    normalizeWorkspaceRoot(a.workspaceRoot ?? '') ===
      normalizeWorkspaceRoot(b.workspaceRoot ?? '') &&
    a.lead.taskId === b.lead.taskId &&
    a.lead.missing === b.lead.missing &&
    a.related.length === b.related.length &&
    a.related.every((task, i) => task.taskId === b.related[i].taskId)
  );
}

function linkKey(link: TaskLink): string {
  return `${normalizeWorkspaceRoot(link.workspaceRoot ?? '')}\0${link.lead.taskId}`;
}

export function documentExcerpt(content: string): string {
  const body = content.replace(/^\uFEFF?---[ \t]*\r?\n(?=---[ \t]*(?:\r?\n|$)|[ \t]*[A-Za-z_][\w-]*[ \t]*:)(?:(?![ \t]*\r?\n|#{1,6}[ \t])[^\r\n]*\r?\n)*?---[ \t]*(?:\r?\n|$)/, '').trim();
  if (!body) return 'No content';
  const lines = body.slice(0, 1500).split(/\r?\n/);
  return lines.slice(0, 12).join('\n') + (body.length > 1500 || lines.length > 12 ? '…' : '');
}

/**
 * Reads the TASK section's data: resolves the session's lead task link from
 * the session organization, reads it with `tasks:getDigest`, refreshes it on
 * `tasks:changed`, and opens its documents through `FILE_LINK_OPENER`.
 *
 * Component-scoped (provided by the TASK section), so a closed inspector
 * fetches nothing. One read in flight; a trigger during flight re-reads once
 * after it; a result for a lead that changed meanwhile is dropped.
 */
@Injectable()
export class SessionTaskReader {
  private readonly chatStore = inject(ChatStore);
  private readonly organizationCache = inject(SessionOrganizationCache);
  private readonly tabs = inject(TabManagerService);
  private readonly appState = inject(AppStateManager);
  private readonly vscode = inject(VSCodeService);
  private readonly feed = inject(TasksChangedFeed);
  private readonly opener = inject(FILE_LINK_OPENER, { optional: true });
  private readonly logger = inject(LoggingService);

  private readonly tabIdSource = signal<Signal<string> | null>(null);
  private readonly result = signal<{
    readonly key: string;
    readonly state: SectionState<TaskSectionData>;
  } | null>(null);
  private readonly _openError = signal<TaskDocumentOpenError | null>(null);
  private readonly _preview = signal<TaskDocumentPreview | null>(null);
  readonly preview = computed(() => {
    const link = this.link();
    return (link ? linkKey(link) : null) === this.previewTaskKey ? this._preview() : null;
  });
  private readonly previewCache = new Map<string, string>();
  readonly progress = computed(() => this.state()?.data?.digest?.progress ?? null);
  private previewSequence = 0;
  private previewTaskKey: string | null = null;

  private inFlight = false;
  private dirty = false;
  private destroyed = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  /** `tasks:changed` events up to this sequence predate the reader. */
  private readonly seenSeq = this.feed.changes()?.seq ?? 0;

  /** Whether documents can be opened in this host. */
  readonly canOpen = this.opener !== null;
  readonly openError = this._openError.asReadonly();

  readonly link = computed<TaskLink | null>(
    () => {
      const tabId = this.tabIdSource()?.();
      if (!tabId || !this.chatStore.organizationAvailable()) return null;
      const found = this.tabs.findTabByIdAcrossWorkspaces(tabId);
      const sessionId = found?.tab.claudeSessionId;
      if (!sessionId) return null;
      // The cache serves the loaded `session:list` row and, for a session
      // outside it (paging, filters), one `session:getOrganization` read that
      // `session:organizationChanged` refreshes — so the link also resolves
      // for tabs whose session row is not loaded (TASK_2026_854).
      const tasks = this.organizationCache.organizationFor(sessionId)()?.tasks;
      if (!tasks) return null;
      return resolveLink(
        tasks,
        found.workspacePath ?? this.appState.workspaceInfo()?.path ?? null,
      );
    },
    { equal: sameLink },
  );

  /** Section state; `null` while the link is unknown (no section, D27). */
  readonly state = computed<SectionState<TaskSectionData> | null>(() => {
    const link = this.link();
    if (!link) return null;
    const held = this.result();
    if (held && held.key === linkKey(link)) {
      if (!held.state.data) return held.state;
      return {
        ...held.state,
        data: { ...held.state.data, related: this.relatedOf(link) },
      };
    }
    return { status: 'loading', data: this.sectionData(link, null) };
  });

  constructor() {
    // Re-read on every change of the resolved link (lead, root).
    effect(() => {
      const link = this.link();
      const key = link ? linkKey(link) : null;
      if (key !== this.previewTaskKey) {
        this.previewTaskKey = key;
        this.closePreview();
        this._openError.set(null);
        this.result.set(null);
        if (this.refreshTimer !== null) {
          clearTimeout(this.refreshTimer);
          this.refreshTimer = null;
        }
      }
      if (link) untracked(() => void this.read());
    });

    // Live refresh on `tasks:changed` for this workspace and task folder.
    effect(() => {
      const event = this.feed.changes();
      if (!event || event.seq <= this.seenSeq) return;
      untracked(() => {
        const link = this.link();
        if (!link?.workspaceRoot) return;
        const change = event.change;
        if (
          normalizeWorkspaceRoot(change.workspaceRoot) !==
          normalizeWorkspaceRoot(link.workspaceRoot)
        )
          return;
        const held = this.result();
        const folder = held?.key === linkKey(link)
          ? held.state.data?.digest?.task.folderName
          : null;
        if (change.folderNames && folder && !change.folderNames.includes(folder))
          return;
        const key = linkKey(link);
        for (const cacheKey of this.previewCache.keys()) {
          if (cacheKey.startsWith(`${key}\0`)) this.previewCache.delete(cacheKey);
        }
        const previewFile = this._preview()?.file;
        if (previewFile) void this.previewDocument(previewFile);
        this.scheduleRefresh();
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    });
  }

  /** Bind the tab whose session is read (the section's `tabId` input). */
  bind(tabId: Signal<string>): void {
    this.tabIdSource.set(tabId);
  }

  /** `Retry loading task`. */
  retry(): void {
    void this.read();
  }

  closePreview(): void {
    this.previewSequence++;
    this._preview.set(null);
  }

  async previewDocument(file: string): Promise<void> {
    const link = this.link();
    const sequence = ++this.previewSequence;
    if (this.destroyed) return;
    const taskId = this.openableTaskId(file);
    if (!link || !taskId) {
      this._preview.set({ file, status: 'error', content: '', reason: 'not-openable' });
      return;
    }

    const key = linkKey(link);
    const cacheKey = `${key}\0${file}`;
    const cached = this.previewCache.get(cacheKey);
    if (cached !== undefined) {
      this._preview.set({ file, status: 'ready', content: cached });
      return;
    }

    this._preview.set({ file, status: 'loading', content: '' });
    const params = { workspaceRoot: link.workspaceRoot ?? undefined, taskId, file };
    try {
      const result = isDocFile(file)
        ? await rpcCall<TasksGetArtifactResult>(this.vscode, 'tasks:getArtifact', params)
        : await rpcCall<TasksReadFolderMarkdownResult>(this.vscode, 'tasks:readFolderMarkdown', params);
      if (sequence !== this.previewSequence || !this.isCurrent(key)) return;
      const document = result.success && result.data?.file === file ? result.data : null;
      let reason: TaskDocumentFailure = 'unavailable';
      if (this.openableTaskId(file) !== taskId) {
        reason = 'not-openable';
      } else if (document && (!('state' in document) || document.taskId === taskId)) {
        if ('state' in document && document.state !== 'ready') {
          reason = document.state;
        } else if (document.content !== null) {
          const excerpt = documentExcerpt(document.content);
          this.previewCache.set(cacheKey, excerpt);
          this._preview.set({ file, status: 'ready', content: excerpt });
          return;
        }
      }
      this._preview.set({ file, status: 'error', content: '', reason });
    } catch (error: unknown) {
      if (sequence !== this.previewSequence || !this.isCurrent(key)) return;
      this.logger.error('SessionTaskReader', 'Could not preview task document', error instanceof Error ? error : new Error(String(error)));
      this._preview.set({ file, status: 'error', content: '', reason: 'unavailable' });
    }
  }

  async openDocument(file: string, origin?: Element | null): Promise<void> {
    if (this.destroyed) return;
    const link = this.link();
    const taskId = this.openableTaskId(file);
    const root = link?.workspaceRoot;
    if (!link || !root || !this.opener) {
      this._openError.set({ file, reason: 'unavailable' });
      return;
    }
    if (!taskId) {
      this._openError.set({ file, reason: 'not-openable' });
      return;
    }

    const key = linkKey(link);
    this._openError.set(null);
    try {
      const response = await rpcCall<TasksReadFolderMarkdownResult>(this.vscode, 'tasks:readFolderMarkdown', {
        workspaceRoot: root, taskId, file,
      });
      if (this.destroyed) return;
      if (!this.isCurrent(key, link) || this.state()?.status === 'unknown') {
        this._openError.set({ file, reason: 'stale' });
        return;
      }
      const document = response.success ? response.data : null;
      if (!document || document.taskId !== taskId || document.file !== file) {
        this._openError.set({ file, reason: 'unavailable' });
        return;
      }
      if (document.state !== 'ready') {
        this._openError.set({ file, reason: document.state });
        return;
      }
      if (this.openableTaskId(file) !== taskId) {
        this._openError.set({ file, reason: 'not-openable' });
        return;
      }

      // The editor reopens this path for reading. The file can change between
      // the contained backend check and the editor's own path open.
      const path = `${root.replace(/[\\/]+$/, '')}/.ptah/specs/${taskId}/${file}`;
      await this.opener.open({ path, origin });
    } catch (error: unknown) {
      if (this.destroyed) return;
      this.logger.error('SessionTaskReader', 'Could not open a task document', error instanceof Error ? error : new Error(String(error)));
      const current = this.isCurrent(key, link) && this.state()?.status !== 'unknown';
      this._openError.set({ file, reason: current ? 'unavailable' : 'stale' });
    }
  }

  private openableTaskId(file: string): string | null {
    const data = this.state()?.data;
    if (!data || !isReadableTaskFolderMarkdownName(file)) return null;
    const openable = data.digest
      ? data.digest.documents.some(document => document.name === file && document.openable)
      : data.documents.includes(file);
    return openable ? data.lead.taskId : null;
  }

  private sectionData(link: TaskLink, digest: TaskDigest | null): TaskSectionData {
    return {
      lead: { taskId: link.lead.taskId, missing: link.lead.missing },
      digest,
      task: digest?.task ?? null,
      documents: digest?.documents.map(document => document.name) ?? [],
      stage: null,
      related: this.relatedOf(link),
    };
  }

  private relatedOf(link: TaskLink): TaskSectionData['related'] {
    return link.related.map((task) => ({
      taskId: task.taskId,
      title: null,
      status: null,
    }));
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.read();
    }, REFRESH_DEBOUNCE_MS);
  }

  private async read(): Promise<void> {
    if (this.destroyed) return;
    if (this.inFlight) {
      this.dirty = true;
      return;
    }
    const link = untracked(this.link);
    if (!link) return;
    const taskId = link.lead.taskId;
    const key = linkKey(link);
    const held = untracked(this.result);
    const data = held?.key === key && held.state.data
      ? held.state.data
      : this.sectionData(link, null);
    this.inFlight = true;
    this.result.set({ key, state: { status: 'loading', data } });
    try {
      const params = {
        workspaceRoot: link.workspaceRoot ?? undefined,
        taskId,
      } satisfies TasksGetDigestParams;
      const response = await rpcCall<TasksGetDigestResult>(this.vscode, 'tasks:getDigest', params);
      if (!this.isCurrent(key, link)) return;
      const digest = response.data?.digest;
      if (!response.success || digest === undefined ||
        (digest && (digest.task.id !== taskId || digest.task.folderName !== taskId))) {
        await this.handleDigestFailure(key, link, data);
        return;
      }

      const next = this.sectionData(link, digest);
      this.result.set({
        key,
        state: digest
          ? { status: 'ready', data: next }
          : { status: 'unknown', data: { ...next, lead: { taskId, missing: true } } },
      });
      const previewFile = this._preview()?.file;
      if (previewFile && !this.openableTaskId(previewFile)) {
        this.previewSequence++;
        this._preview.set({ file: previewFile, status: 'error', content: '', reason: 'not-openable' });
      }
    } catch (error: unknown) {
      if (!this.isCurrent(key, link)) return;
      this.logger.error('SessionTaskReader', 'Could not load the task', error instanceof Error ? error : new Error(String(error)));
      await this.handleDigestFailure(key, link, data);
    } finally {
      this.inFlight = false;
      if (this.dirty && !this.destroyed) {
        this.dirty = false;
        void this.read();
      }
    }
  }

  private isCurrent(key: string, requestLink?: TaskLink): boolean {
    const link = untracked(this.link);
    return !this.destroyed && link !== null && linkKey(link) === key &&
      (requestLink === undefined || link === requestLink);
  }

  private async handleDigestFailure(key: string, link: TaskLink, held: TaskSectionData): Promise<void> {
    let data = held;
    if (held.documents.length === 0) {
      const documents = await this.listFallbackDocuments(link);
      if (!this.isCurrent(key, link)) return;
      data = { ...this.sectionData(link, null), documents };
    }
    this.result.set({
      key,
      state: { status: 'error', data, error: 'Could not load task details' },
    });
  }

  private async listFallbackDocuments(link: TaskLink): Promise<readonly string[]> {
    const params = {
      workspaceRoot: link.workspaceRoot ?? undefined,
      taskId: link.lead.taskId,
      directory: '',
    } satisfies TasksListFolderEntriesParams;
    try {
      const response = await rpcCall<TasksListFolderEntriesResult>(this.vscode, 'tasks:listFolderEntries', params);
      const listing = response.data;
      if (!response.success || listing?.state !== 'ready' || listing.taskId !== params.taskId ||
        listing.directory !== params.directory || !Array.isArray(listing.entries)) return [];
      return listing.entries
        .filter(entry => entry?.kind === 'file' && typeof entry.name === 'string' &&
          isReadableTaskFolderMarkdownName(entry.name))
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }
}
