import {
  BATCHES_FILE,
  CARRIER_FILE,
  CONTEXT_FILE,
  DECISIONS_FILE,
  IMPLEMENTATION_PLAN_FILE,
  LEGACY_BATCHES_FILE,
  REVIEW_FILE_PATTERN,
  TASK_DESCRIPTION_FILE,
  TASK_HANDOFF_FILE_PATTERN,
  VERSIONED_DOC_PATTERN,
  isReadableTaskFolderMarkdownName,
  type TaskDigest,
  type TaskDigestExtraction,
  type TaskDocumentKind,
} from '@ptah-extension/shared';

const MARKDOWN_EXTENSION = /\.md$/i;
const NUMBERED_HANDOFF = new RegExp(TASK_HANDOFF_FILE_PATTERN.source, 'i');
const REVIEW_ROUND = /^(?:round-?|r|v)?(\d+)$/i;
const BARE_REREVIEW = /^re-?review(?:-[a-z0-9-]+)?\.md$/i;
const HEADING = /^(#{1,6})(?:[ \t]+|$)/;
const FENCE = /^ {0,3}(\x60{3,}|~{3,})(.*)$/;
const MAX_OPENABLE_BYTES = 1024 * 1024;

export interface TaskDigestDocumentName {
  kind: TaskDocumentKind;
  group: string;
  subject: string;
  revision: number;
  round: number;
}

type TaskProgressCounts = Pick<NonNullable<TaskDigest['progress']>, 'done' | 'total'>;

function asciiLowerCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function classifyTaskDocument(name: string): TaskDocumentKind {
  const lower = asciiLowerCase(name);
  if (lower === CARRIER_FILE) return 'carrier';
  if (NUMBERED_HANDOFF.test(name) || lower === 'handoff.md') return 'handoff';
  if (/^research-report.*\.md$/i.test(name)) return 'design';
  if (/(?:^|-)(?:report|fixes)(?:-[a-z0-9-]+)?\.md$/i.test(name)) return 'reports';
  if (REVIEW_FILE_PATTERN.test(name)) return 'reviews';
  if (lower === CONTEXT_FILE || lower === TASK_DESCRIPTION_FILE) return 'requirements';
  if (lower === BATCHES_FILE || lower === LEGACY_BATCHES_FILE) return 'batches';
  if (lower === DECISIONS_FILE) return 'decisions';
  if (/^implementation-plan.*\.md$/i.test(name)) return 'plan';
  if (/^(?:visual-)?design-.*\.md$/i.test(name)) return 'design';
  return 'other';
}

export function describeTaskDocumentName(name: string): TaskDigestDocumentName {
  const kind = classifyTaskDocument(name);
  let subject = name.replace(MARKDOWN_EXTENSION, '');
  let round = 0;

  if (kind === 'reviews') {
    // The optional subject can consume "re-" in a bare re-review.
    const bareRereview = BARE_REREVIEW.test(name);
    const reviewName = bareRereview ? name.replace(/^re-?/i, '') : name;
    const review = REVIEW_FILE_PATTERN.exec(reviewName);
    subject = review?.[1] ?? '';
    const qualifier = review?.[2] ?? '';
    const numberedRound = REVIEW_ROUND.exec(qualifier);
    const marker = reviewName.slice(subject ? subject.length + 1 : 0);
    round = numberedRound ? Number(numberedRound[1]) : Number(bareRereview || /^re-?review/i.test(marker));
  }

  const version = VERSIONED_DOC_PATTERN.exec(subject);
  const stem = version?.[1] ?? subject;
  return {
    kind,
    group: kind + ':' + asciiLowerCase(stem),
    subject: stem,
    revision: version ? Number(version[2]) : 0,
    round,
  };
}

export function selectLatestTaskDocuments(
  documents: readonly (Pick<TaskDigestDocumentName, 'group' | 'revision' | 'round'> & { name: string; mtime: number })[],
): ReadonlySet<string> {
  const byGroup = new Map<string, (typeof documents)[number]>();
  for (const document of documents) {
    const current = byGroup.get(document.group);
    if (!current) {
      byGroup.set(document.group, document);
      continue;
    }
    const order = document.revision - current.revision
      || document.round - current.round
      || document.mtime - current.mtime;
    if (order > 0 || (order === 0 && document.name < current.name)) {
      byGroup.set(document.group, document);
    }
  }
  return new Set([...byGroup.values()].map(({ name }) => name));
}

export function isTaskDigestDocumentOpenable(name: string, size: number, isFile: boolean): boolean {
  return isFile && isReadableTaskFolderMarkdownName(name) && size <= MAX_OPENABLE_BYTES;
}

function visibleMarkdownLines(text: string): string[] {
  const visible: string[] = [];
  let fence: string | undefined;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r\n?|\n/)) {
    const candidate = FENCE.exec(line);
    if (fence) {
      if (candidate && candidate[1][0] === fence[0] && candidate[1].length >= fence.length && /^[ \t]*$/.test(candidate[2])) {
        fence = undefined;
      }
    } else if (candidate && (candidate[1][0] === '~' || !candidate[2].includes('\x60'))) {
      fence = candidate[1];
    } else {
      visible.push(line);
    }
  }
  return visible;
}

function reviewVerdict(lines: readonly string[]): 'APPROVED' | 'REVISE' | null {
  const heading = /^#{1,6}[ \t]+verdict\b/i;
  const index = lines.findIndex((line) => heading.test(line));
  if (index < 0) return null;
  let scope = lines[index].replace(heading, '').trim();
  if (!scope) {
    scope = lines.slice(index + 1).find((line) => line.trim())?.trim() ?? '';
    if (HEADING.test(scope)) return null;
  }
  if (scope.startsWith('>')) return null;
  const verdict = /\b(APPROVED|REVISE)\b/.exec(scope)?.[1];
  return verdict === 'APPROVED' || verdict === 'REVISE' ? verdict : null;
}

function severity(value: string | undefined): 'serious' | 'moderate' | 'minor' | undefined {
  const lower = value?.toLowerCase();
  return lower === 'serious' || lower === 'moderate' || lower === 'minor' ? lower : undefined;
}

export function extractTaskReview(
  name: string,
  text: string,
  extraction: TaskDigestExtraction = 'ok',
): NonNullable<TaskDigest['reviews']>[number] {
  const { subject, revision, round } = describeTaskDocumentName(name);
  const lines = visibleMarkdownLines(text);
  const counts = { serious: 0, moderate: 0, minor: 0 };
  let sectionSeverity: ReturnType<typeof severity>;
  for (const line of lines) {
    if (HEADING.test(line)) {
      sectionSeverity = severity(/^#{2,4}[ \t]+(Serious|Moderate|Minor)\b/i.exec(line)?.[1]);
    }
    const itemSeverity = severity(/^\s*(?:\d+\.|[-*]|\|)\s*\**\[?(Serious|Moderate|Minor)\b/i.exec(line)?.[1]);
    if (itemSeverity) {
      counts[itemSeverity]++;
    } else if (sectionSeverity && /^ ?(?:\d+\.|[-*])\s+/.test(line)) {
      counts[sectionSeverity]++;
    }
  }
  return { file: name, subject, revision, round, verdict: reviewVerdict(lines), ...counts, extraction };
}

export function extractTaskDecisions(text: string): NonNullable<TaskDigest['decisions']> {
  const lines = visibleMarkdownLines(text);
  const header = lines.findIndex((line, index) => line.startsWith('|')
    && !lines[index - 1]?.startsWith('|')
    && line.split('|').some((cell) => cell.trim() === '#'));
  const result = { rows: 0, pendingUser: 0 };
  if (header < 0) return result;
  for (let index = header + 1; index < lines.length && lines[index].startsWith('|'); index++) {
    const row = lines[index];
    if (/^\|\s*:?-{3,}/.test(row)) continue;
    result.rows++;
    if (row.split('|').some((cell) => /^(?:pending|awaiting)\b/i.test(cell.trim()))) {
      result.pendingUser++;
    }
  }
  return result;
}

export function documentProgress(content: string, file: string = LEGACY_BATCHES_FILE): TaskProgressCounts | null {
  const text = visibleMarkdownLines(content).join('\n');
  if (asciiLowerCase(file) === BATCHES_FILE) {
    const tasks = [...text.matchAll(/^### Task [^\r\n]+? [—-] (PENDING|IN_PROGRESS|IMPLEMENTED|COMPLETE|FAILED)\s*$/gm)];
    if (tasks.length) return { done: tasks.filter(match => match[1] === 'COMPLETE').length, total: tasks.length };
  }
  const checkboxes = [...text.matchAll(/^\s*[-*]\s+\[([ xX])\]/gm)];
  if (checkboxes.length) return { done: checkboxes.filter(match => match[1].toLowerCase() === 'x').length, total: checkboxes.length };
  const statuses = [...text.matchAll(/^\s*status:\s*(done|backlog|in_progress|in_review|blocked|cancelled)\s*$/gim)];
  return statuses.length ? { done: statuses.filter(match => match[1].toLowerCase() === 'done').length, total: statuses.length } : null;
}

export function extractTaskProgress(batches: string | null, legacy: string | null): NonNullable<TaskDigest['progress']> | null {
  const source = batches === null ? LEGACY_BATCHES_FILE : BATCHES_FILE;
  const text = batches ?? legacy;
  const counts = text === null ? null : documentProgress(text, source);
  return counts ? { ...counts, source } : null;
}

export function isTaskDigestQuestionSource(name: string, latest: boolean): boolean {
  const lower = asciiLowerCase(name);
  return lower === CONTEXT_FILE
    || lower === TASK_DESCRIPTION_FILE
    || (latest && describeTaskDocumentName(name).group === 'plan:' + IMPLEMENTATION_PLAN_FILE.replace(MARKDOWN_EXTENSION, ''));
}

export function countTaskOpenQuestions(text: string): number {
  let total = 0;
  let sectionLevel = 0;
  for (const line of visibleMarkdownLines(text)) {
    const level = HEADING.exec(line)?.[1].length;
    if (level && level <= sectionLevel) sectionLevel = 0;
    const section = /^(#{2,3})[ \t]+open questions\b/i.exec(line);
    if (section && !sectionLevel) sectionLevel = section[1].length;
    if (!sectionLevel) continue;
    const item = /^(?:\d+\.|[-*])\s+(\S.*)/.exec(line)?.[1];
    if (item && !/^\[x\]|Resolved:|\(resolved\)/i.test(item)) total++;
  }
  return total;
}
