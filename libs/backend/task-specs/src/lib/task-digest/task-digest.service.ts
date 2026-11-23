import { inject, injectable } from 'tsyringe';
import { FileType, type DirectoryEntry } from '@ptah-extension/platform-core';
import {
  BATCHES_FILE,
  CARRIER_FILE,
  CONTEXT_FILE,
  DECISIONS_FILE,
  IMPLEMENTATION_PLAN_FILE,
  LEGACY_BATCHES_FILE,
  TASK_DESCRIPTION_FILE,
  isReadableTaskFolderMarkdownName,
  type TaskDigest,
  type TaskDigestDocument,
  type TaskSpecSummary,
} from '@ptah-extension/shared';
import type { ContainedTaskFolder, ContainedTaskInspect } from '../contained-task-folder';
import { TASK_SPECS_TOKENS } from '../di/tokens';
import { normalizeWorkspaceRoot } from '../normalize-workspace-root';
import { parseTaskFile } from '../task-frontmatter';
import type { TaskIndexService } from '../task-index.service';
import {
  countTaskOpenQuestions,
  describeTaskDocumentName,
  extractTaskDecisions,
  extractTaskProgress,
  extractTaskReview,
  isTaskDigestDocumentOpenable,
  isTaskDigestQuestionSource,
  selectLatestTaskDocuments,
} from './task-digest-rules';

const TOP_STAT_CAP = 500;
const NESTED_LIST_CAP = 64;
const NESTED_TOTAL_CAP = 1000;
const NESTED_DIR_CAP = 200;
const MAX_READS = 24;
const CARRIER_MAX_BYTES = 1024 * 1024;
const EXTRACTION_MAX_BYTES = 64 * 1024;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const PRIORITY_NAMES = [
  CARRIER_FILE, CONTEXT_FILE, TASK_DESCRIPTION_FILE, BATCHES_FILE,
  LEGACY_BATCHES_FILE, DECISIONS_FILE, IMPLEMENTATION_PLAN_FILE,
];

type Reason = TaskDigest['truncatedReasons'][number];
type DirectorySummary = NonNullable<TaskDigest['directories']>[number];
type FileMetadata = Extract<ContainedTaskInspect, { state: 'file' }>;
type Fragment =
  | { state: 'ready'; task: TaskSpecSummary | null }
  | { state: 'ready' | 'capped'; text: string };

function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((a, b) => compareNames(a.name, b.name));
}

function recent<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
}

function sameFile(before: FileMetadata | undefined, after: ContainedTaskInspect): boolean {
  return before !== undefined && after.state === 'file' && before.size === after.size && before.mtime === after.mtime;
}

async function summarizeDirectories(folder: ContainedTaskFolder, entries: DirectoryEntry[], reasons: Set<Reason>) {
  const directories: DirectorySummary[] = entries.filter(({ type }) => type === FileType.Directory)
    .map(({ name }) => ({ name, files: 0, markdown: 0, images: 0, directories: 0, symlinks: 0, truncated: false }));
  const children: { parts: [string, string]; summary: DirectorySummary }[] = [];
  let listsUsed = 0;
  let countedEntries = 0;
  let stable = true;

  function truncate(summary: DirectorySummary, reason: 'depth' | 'nested'): void {
    summary.truncated = true;
    reasons.add(reason);
  }

  function hasBudget(reservedLists = 0): boolean {
    return listsUsed + reservedLists < NESTED_LIST_CAP && countedEntries < NESTED_TOTAL_CAP;
  }

  async function visit(parts: string[], summary: DirectorySummary): Promise<DirectoryEntry[]> {
    if (!hasBudget()) {
      truncate(summary, 'nested');
      return [];
    }
    listsUsed++;
    const listed = await folder.list(parts, 2);
    if (listed.state !== 'ready') {
      stable = false;
      truncate(summary, 'nested');
      return [];
    }
    const count = Math.min(listed.entries.length, NESTED_DIR_CAP, NESTED_TOTAL_CAP - countedEntries);
    if (count < listed.entries.length) truncate(summary, 'nested');
    countedEntries += count;
    const counted = sortedEntries(listed.entries).slice(0, count);
    const subdirectories: DirectoryEntry[] = [];
    for (const { name, type } of counted) {
      if (type === FileType.Directory) {
        summary.directories++;
        subdirectories.push({ name, type });
      } else if (type === FileType.SymbolicLink) {
        summary.symlinks++;
      } else if (type === FileType.File) {
        summary.files++;
        if (isReadableTaskFolderMarkdownName(name)) summary.markdown++;
        if (IMAGE_EXTENSION.test(name)) summary.images++;
      }
    }
    return subdirectories;
  }

  for (const [index, summary] of directories.entries()) {
    const subdirectories = await visit([summary.name], summary);
    const remainingParents = directories.length - index - 1;
    for (const { name } of subdirectories) {
      if (hasBudget(remainingParents + children.length)) {
        children.push({ parts: [summary.name, name], summary });
      } else {
        truncate(summary, 'nested');
      }
    }
  }
  for (const { parts, summary } of children) {
    if ((await visit(parts, summary)).length > 0) truncate(summary, 'depth');
  }
  return { directories, stable };
}

@injectable()
export class TaskDigestService {
  private readonly inFlight = new Map<string, Promise<TaskDigest | null>>();
  private readonly digests = new Map<string, { signature: string; digest: TaskDigest }>();
  private readonly fragments = new Map<string, { metadata: FileMetadata; fragment: Fragment }>();

  constructor(@inject(TASK_SPECS_TOKENS.TASK_INDEX_SERVICE) private readonly index: TaskIndexService) {}

  getDigest(workspaceRoot: string, taskId: string): Promise<TaskDigest | null> {
    const root = normalizeWorkspaceRoot(workspaceRoot);
    const key = root + '\0' + taskId;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const request = this.compute(root, taskId).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private async loadFragment(
    folder: ContainedTaskFolder, taskId: string, name: string, metadata: FileMetadata | undefined,
  ): Promise<{ fragment: Fragment; stable: boolean } | { state: string }> {
    const key = folder.fragmentCacheKey + '\0' + name;
    const cached = this.fragments.get(key);
    if (metadata && cached && sameFile(cached.metadata, metadata)) {
      recent(this.fragments, key, cached, 1024);
      return { fragment: cached.fragment, stable: true };
    }
    this.fragments.delete(key);
    const carrier = name === CARRIER_FILE;
    const read = await folder.read(name, carrier ? CARRIER_MAX_BYTES : EXTRACTION_MAX_BYTES);
    if (read.state !== 'ready' && read.state !== 'capped') return { state: read.state };
    let fragment: Fragment;
    if (carrier) {
      if (read.state === 'capped') return { state: read.state };
      const parsed = parseTaskFile(taskId, read.content);
      fragment = { state: 'ready', task: parsed.kind === 'task' ? parsed.task : null };
    } else {
      // Only complete lines from the capped prefix enter the extractors.
      const text = read.state === 'capped' ? read.content.slice(0, read.content.lastIndexOf('\n') + 1) : read.content;
      fragment = { state: read.state, text };
    }
    const stable = sameFile(metadata, await folder.inspect(name));
    if (stable && metadata) recent(this.fragments, key, { metadata, fragment }, 1024);
    return { fragment, stable };
  }

  private async compute(root: string, taskId: string): Promise<TaskDigest | null> {
    const opened = await this.index.openContainedTask(root, taskId);
    if (opened.state === 'missing') return null;
    if (opened.state !== 'ready') throw new Error(`Task folder unavailable: ${opened.state}`);
    const { folder } = opened;
    const listing = await folder.list([], 2);
    if (listing.state === 'missing') return null;
    if (listing.state !== 'ready') throw new Error(`Task folder listing failed: ${listing.state}`);

    const entryCount = listing.entries.length;
    const prefix = sortedEntries(listing.entries).slice(0, TOP_STAT_CAP);
    const reasons = new Set<Reason>();
    if (entryCount > TOP_STAT_CAP) reasons.add('entries');
    const sources = new Map<string, FileType | undefined>(prefix.map(({ name, type }) => [name, type]));
    const priorityTypes = new Map(listing.entries.filter(({ name }) => PRIORITY_NAMES.includes(name))
      .map(({ name, type }) => [name, type]));
    for (const name of PRIORITY_NAMES) if (!sources.has(name)) sources.set(name, priorityTypes.get(name));
    const metadata = new Map<string, FileMetadata>();
    const signatureEntries = [];
    const candidates = [];
    let stable = true;
    const sortedSources = [...sources].sort(([a], [b]) => compareNames(a, b));
    for (const [name, type] of sortedSources) {
      const entry = await folder.inspect(name);
      signatureEntries.push([name, type, entry]);
      if (entry.state === 'file') {
        metadata.set(name, entry);
        candidates.push({ name, ...describeTaskDocumentName(name), size: entry.size, mtime: entry.mtime, statFailed: false });
      } else if (type === FileType.File) {
        stable = false;
        candidates.push({ name, ...describeTaskDocumentName(name), size: 0, mtime: 0, statFailed: true });
      } else if (entry.state === 'unreadable' || (type !== undefined && entry.state === 'missing')) {
        stable = false;
      }
    }
    const { directories, stable: nestedStable } = await summarizeDirectories(folder, prefix, reasons);
    stable = stable && nestedStable;
    const merged = this.index.isTaskMerged(root, taskId);
    const signature = JSON.stringify([signatureEntries, directories, entryCount, [...reasons], merged]);
    const cached = this.digests.get(folder.cacheKey);
    if (stable && cached?.signature === signature) {
      recent(this.digests, folder.cacheKey, cached, 32);
      return cached.digest;
    }
    this.digests.delete(folder.cacheKey);

    const carrier = await this.loadFragment(folder, taskId, CARRIER_FILE, metadata.get(CARRIER_FILE));
    if ('state' in carrier) {
      if (carrier.state === 'missing') return null;
      throw new Error(`Task carrier read failed: ${carrier.state}`);
    }
    if (!('task' in carrier.fragment) || !carrier.fragment.task) return null;
    stable = stable && carrier.stable;

    const latest = selectLatestTaskDocuments(candidates.filter(({ statFailed }) => !statFailed));
    const counts: TaskDigest['counts'] = {
      carrier: 0, handoff: 0, requirements: 0, design: 0, plan: 0,
      batches: 0, decisions: 0, reviews: 0, reports: 0, other: 0,
    };
    let lastModified: number | null = null;
    const documents = candidates.sort((a, b) => compareNames(a.name, b.name))
      .map(({ name, kind, group, revision, size, mtime, statFailed }): TaskDigestDocument => {
        if (!statFailed) {
          counts[kind]++;
          lastModified = Math.max(lastModified ?? mtime, mtime);
        }
        return {
          name, kind, group, revision, latest: latest.has(name),
          size, mtime, openable: isTaskDigestDocumentOpenable(name, size, !statFailed),
          readable: statFailed ? false : null, extraction: statFailed ? 'failed' : 'none',
        };
      });
    const byName = new Map(documents.map((doc) => [doc.name, doc]));
    const carrierDocument = byName.get(CARRIER_FILE);
    if (carrierDocument) {
      carrierDocument.readable = true;
      carrierDocument.extraction = 'ok';
    }
    const progressName = byName.has(BATCHES_FILE) ? BATCHES_FILE : LEGACY_BATCHES_FILE;
    const plans = documents.filter((doc) => doc.kind === 'plan' && doc.latest);
    const reviews = documents.filter((doc) => doc.kind === 'reviews' && doc.latest)
      .sort((a, b) => b.mtime - a.mtime || compareNames(a.name, b.name));
    const readOrder = [progressName, DECISIONS_FILE, CONTEXT_FILE, TASK_DESCRIPTION_FILE]
      .flatMap((name) => byName.get(name) ?? []);
    const extracted = new Map<string, string>();
    let reads = 0;
    for (const doc of [...readOrder, ...plans, ...reviews]) {
      if (doc.readable === false || !isReadableTaskFolderMarkdownName(doc.name)) continue;
      if (reads === MAX_READS) {
        doc.extraction = 'skipped';
        reasons.add('reads');
        continue;
      }
      reads++;
      const result = await this.loadFragment(folder, taskId, doc.name, metadata.get(doc.name));
      if ('state' in result || !('text' in result.fragment)) {
        doc.readable = false;
        doc.extraction = 'failed';
        stable = false;
        continue;
      }
      stable = stable && result.stable;
      doc.readable = true;
      doc.extraction = result.fragment.state === 'capped' ? 'capped' : 'ok';
      if (result.fragment.state === 'capped') reasons.add('bytes');
      extracted.set(doc.name, result.fragment.text);
    }

    const progressText = (name: string) => byName.has(name) ? extracted.get(name) ?? '' : null;
    const progress = extractTaskProgress(progressText(BATCHES_FILE), progressText(LEGACY_BATCHES_FILE));
    const decisions = extracted.get(DECISIONS_FILE);
    const questionSources = documents.filter((doc) => isTaskDigestQuestionSource(doc.name, doc.latest) && extracted.has(doc.name));
    const digest: TaskDigest = {
      task: this.index.withEffectiveTaskStatus(carrier.fragment.task, merged),
      truncated: reasons.size > 0,
      truncatedReasons: [...reasons],
      entryCount,
      lastModified,
      documents,
      counts,
      ...(directories.length > 0 && { directories }),
      ...(reviews.length > 0 && {
        reviews: reviews.map((doc) => extractTaskReview(doc.name, extracted.get(doc.name) ?? '', doc.extraction)),
      }),
      ...(decisions !== undefined && { decisions: extractTaskDecisions(decisions) }),
      ...(progress && { progress }),
      ...(questionSources.length > 0 && {
        openQuestions: questionSources.reduce((sum, doc) => sum + countTaskOpenQuestions(extracted.get(doc.name) ?? ''), 0),
      }),
    };
    if (stable) recent(this.digests, folder.cacheKey, { signature, digest }, 32);
    return digest;
  }
}
