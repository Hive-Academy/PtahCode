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
const FENCE = /^ {0,3}(\x60{3,}|~{3,})/;
const REPORT_SUFFIX = /(?:^|[^a-z0-9-])[a-z0-9-]*\.md$/;
const REPORT_TAG = /(?:^|-)(?:report|fixes)(?=-[a-z0-9-]|\.md$)/;
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
  // A review of a report (`research-report-review.md`) is a review; a report
  // about a review (`review-fix-report.md`) keeps its report tag in the qualifier.
  const review = REVIEW_FILE_PATTERN.exec(name);
  if (review && !REPORT_TAG.test(asciiLowerCase(review[2] ?? '') + '.md')) return 'reviews';
  if (/^research-report.*\.md$/i.test(name)) return 'design';
  const reportSuffix = REPORT_SUFFIX.exec(lower)?.[0];
  if (reportSuffix && REPORT_TAG.test(reportSuffix)) return 'reports';
  if (review) return 'reviews';
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
    const marker = candidate?.[1];
    const suffix = candidate ? line.slice(candidate[0].length) : '';
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && /^[ \t]*$/.test(suffix)) {
        fence = undefined;
      }
    } else if (marker && (marker[0] === '~' || !suffix.includes('\x60'))) {
      fence = marker;
      // A hidden block still separates the blocks around it, so a table cannot run across it.
      visible.push('');
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
  const sections: { level: number; tag: NonNullable<ReturnType<typeof severity>>; inFinding: boolean }[] = [];
  let summaryLevel = 0;
  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      while (sections.length && sections[sections.length - 1].level >= level) sections.pop();
      const parent = sections.at(-1);
      const label = line.slice(heading[0].length).trimEnd().replace(/[ \t]#+$/, '').trimEnd();
      if (level <= summaryLevel) summaryLevel = 0;
      if (!summaryLevel && /^(?:Review[ \t]+)?Summary:?$/i.test(label)) summaryLevel = level;
      const severityHeading = parent
        ? /^(Serious|Moderate|Minor)(?:[ \t]+(?:issues|findings))?[ \t]*$/i
        : /^(Serious|Moderate|Minor)\b/i;
      const tag = level >= 2 && level <= 4 ? severity(severityHeading.exec(label)?.[1]) : undefined;
      if (tag) {
        sections.push({ level, tag, inFinding: false });
      } else if (parent && level === parent.level + 1) {
        counts[parent.tag]++;
        parent.inFinding = true;
      }
      continue;
    }

    const table = /^[ \t]*\|([^|]*)\|/.exec(line);
    if (table) {
      if (summaryLevel) continue;
      const tag = table[1].trim().replace(/^\*\*(.*)\*\*$/, '$1').replace(/^\[(.*)\]$/, '$1');
      const tableSeverity = severity(tag);
      if (tableSeverity) counts[tableSeverity]++;
      continue;
    }
    if (summaryLevel) continue;
    const section = sections.at(-1);
    if (section?.inFinding) continue;
    const itemSeverity = severity(/^[ \t]*(?:\d+\.|[-*])[ \t]*\**\[?(Serious|Moderate|Minor)\b/i.exec(line)?.[1]);
    if (itemSeverity) {
      counts[itemSeverity]++;
    } else if (section && /^ ?(?:\d+\.|[-*])[ \t]+/.test(line)) {
      counts[section.tag]++;
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
    if (/^\|[ \t]*:?-{3,}/.test(row)) continue;
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
    const tasks = [...text.matchAll(/^### Task .+? [—-] (PENDING|IN_PROGRESS|IMPLEMENTED|COMPLETE|FAILED)[ \t]*$/gm)];
    if (tasks.length) return { done: tasks.filter(match => match[1] === 'COMPLETE').length, total: tasks.length };
  }
  const checkboxes = [...text.matchAll(/^[ \t]*[-*][ \t]+\[([ xX])\]/gm)];
  if (checkboxes.length) return { done: checkboxes.filter(match => match[1].toLowerCase() === 'x').length, total: checkboxes.length };
  const statuses = [...text.matchAll(/^[ \t]*status:[ \t]*(done|backlog|in_progress|in_review|blocked|cancelled)[ \t]*$/gim)];
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
    const item = /^(?:\d+\.|[-*])[ \t]+(\S.*)/.exec(line)?.[1];
    if (item && !/^\[x\]|\bResolved:|\(resolved\)/i.test(item)) total++;
  }
  return total;
}
