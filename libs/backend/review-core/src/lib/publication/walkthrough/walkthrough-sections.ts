import type { RepoIdentity } from '@ptah-extension/review-contracts';
import type { DiffStats } from './diff-stats';
import type { TriageOutput, TriageRiskLevel } from './triage-output.schema';
import { cell, code, cut, isSha, listWithMore, plain, plural, shortSha, type Redact } from './walkthrough-text';

export type FindingSeverity = 'Critical' | 'Major' | 'Minor' | 'Nitpick';

/** Counts of one run. In an incremental run they say nothing about findings of earlier runs. */
export interface WalkthroughFindingCounts {
  readonly bySeverity: Readonly<Record<FindingSeverity, number>>;
  readonly heldLocally: number;
  readonly dismissed: number;
  /** Findings of an earlier run that this run confirmed again and did not publish a second time. */
  readonly carriedOver?: number;
}

export interface WalkthroughScope {
  readonly previousReviewedHeadSha: string | null;
  readonly changedPaths: readonly string[];
  readonly dependentPaths: readonly string[];
  readonly recheckFailureIds: readonly string[];
}

export interface WalkthroughLens { readonly lens: string; readonly status: string }

export interface TopBlockInput {
  readonly repo: RepoIdentity;
  readonly headSha: string;
  readonly summary: string;
  readonly changeType: string | null;
  readonly risk: { readonly level: TriageRiskLevel; readonly reason: string } | null;
  readonly lenses: readonly WalkthroughLens[];
  readonly scope: WalkthroughScope | null;
  readonly diffStats: DiffStats | null;
  readonly findings: WalkthroughFindingCounts;
  readonly redact: Redact;
}

const severityIcon: Record<FindingSeverity, string> = { Critical: '🔴', Major: '🟠', Minor: '🟡', Nitpick: '🔵' };
const severityName: Record<FindingSeverity, string> = { Critical: 'critical', Major: 'major', Minor: 'minor', Nitpick: 'nitpick' };
const riskIcon: Record<TriageRiskLevel, string> = { low: '🟢', medium: '🟡', high: '🔴' };
const severities: readonly FindingSeverity[] = ['Critical', 'Major', 'Minor', 'Nitpick'];

function repoUrl(repo: RepoIdentity): string {
  return `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

function shaLink(repo: RepoIdentity, sha: string): string {
  return isSha(sha) ? `[\`${shortSha(sha)}\`](${repoUrl(repo)}/commit/${sha})` : code(shortSha(sha));
}

function stateRow(lenses: readonly WalkthroughLens[], redact: Redact, reasonMax = 40): string {
  const unavailable = lenses.filter((item) => item.status !== 'completed');
  if (lenses.length === 0) return '⚠️ **Partial** · no lens ran';
  if (unavailable.length === 0) return `✅ **Complete** · ${lenses.length} of ${lenses.length} lenses ran`;
  const reasons = unavailable.map((item) => reasonMax > 0
    ? `${cell(item.lens, 40, redact)} (${plain(cut(item.status.replace(/^unavailable:\s*/, ''), reasonMax), redact)})`
    : cell(item.lens, 40, redact));
  return `⚠️ **Partial** · ${unavailable.length} of ${lenses.length} lenses unavailable: ${reasons.join(', ')}`;
}

function scopeRow(input: TopBlockInput): string {
  const previous = input.scope?.previousReviewedHeadSha ?? null;
  if (previous === null) return 'Initial review of the full PR';
  const range = isSha(previous)
    ? `[\`${shortSha(previous)}…${shortSha(input.headSha)}\`](${repoUrl(input.repo)}/compare/${previous}...${input.headSha})`
    : code(shortSha(previous));
  const dependents = input.scope?.dependentPaths.length ?? 0;
  const files = input.scope?.changedPaths.length ?? 0;
  return `Incremental · ${range} · ${plural(files, 'changed file')}${dependents ? `, ${plural(dependents, 'dependent')}` : ''}`;
}

function sizeRow(stats: DiffStats | null, changeType: string | null, incremental: boolean): string {
  const kind = changeType ? ` · ${changeType}` : '';
  const since = incremental ? ' since the last review' : '';
  if (!stats) return `size unavailable${kind}`;
  if (stats.files === 0) return `No file changes${since}${kind}`;
  const atLeast = stats.truncated ? 'at least ' : '';
  return `${atLeast}${plural(stats.files, 'file')} · +${stats.additions} −${stats.deletions}${since}${stats.truncated ? ' · diff truncated' : ''}${kind}`;
}

function findingsRow(findings: WalkthroughFindingCounts, incremental: boolean): string {
  const verified = severities.reduce((sum, item) => sum + findings.bySeverity[item], 0);
  const carried = findings.carriedOver ?? 0;
  const thisRun = incremental ? ' in this run' : '';
  const parts = verified === 0 ? [`No ${incremental ? 'new ' : ''}verified findings${thisRun}`]
    : [`**${verified} verified${thisRun}** (${severities.filter((item) => findings.bySeverity[item] > 0)
      .map((item) => `${severityIcon[item]} ${findings.bySeverity[item]} ${severityName[item]}`).join(' · ')})`];
  if (findings.heldLocally > 0 || findings.dismissed > 0 || verified > 0)
    parts.push(`${findings.heldLocally} held locally`, `${findings.dismissed} dismissed`);
  if (carried > 0) parts.push(`${plural(carried, 'earlier finding')} still present`);
  if (incremental) parts.push('earlier findings stay in their review threads');
  return parts.join(' · ');
}

/** Each tier cuts the model text of the top block harder. The block must stay inside its budget. */
const TOP_BLOCK_TIERS = [
  { summary: 400, reason: 120, lens: 40 },
  { summary: 200, reason: 60, lens: 20 },
  { summary: 100, reason: 0, lens: 10 },
  { summary: 0, reason: 0, lens: 0 },
] as const;
export const MAX_TOP_BLOCK = 1_500;
const SUMMARY_OMITTED = 'The summary was left out to keep this comment short.';

function renderTopBlockTier(input: TopBlockInput, tier: (typeof TOP_BLOCK_TIERS)[number]): string {
  const redact = input.redact;
  const incremental = input.scope?.previousReviewedHeadSha != null;
  const lines = [`## PtahCode review · ${shaLink(input.repo, input.headSha)}`, '',
    tier.summary > 0 ? cell(input.summary, tier.summary, redact) : SUMMARY_OMITTED, '',
    '| | |', '| --- | --- |',
    `| **State** | ${stateRow(input.lenses, redact, tier.lens)} |`,
    `| **Scope** | ${scopeRow(input)} |`,
    `| **Size** | ${sizeRow(input.diffStats, input.changeType ? plain(input.changeType) : null, incremental)} |`];
  if (input.risk) {
    const reason = tier.reason > 0 ? ` · ${cell(input.risk.reason, tier.reason, redact)}` : '';
    lines.push(`| **Risk** | ${riskIcon[input.risk.level]} ${input.risk.level[0].toUpperCase()}${input.risk.level.slice(1)}${reason} |`);
  }
  lines.push(`| **Findings** | ${findingsRow(input.findings, incremental)} |`);
  return lines.join('\n');
}

/** The always-visible block: title, summary and the status table. At most `MAX_TOP_BLOCK` characters. */
export function renderTopBlock(input: TopBlockInput): string {
  let text = '';
  for (const tier of TOP_BLOCK_TIERS) {
    text = renderTopBlockTier(input, tier);
    if (text.length <= MAX_TOP_BLOCK) return text;
  }
  return text;
}

export interface ChangesOptions { readonly maxRows: number; readonly diffStats?: DiffStats | null }

/**
 * Files column of an area. With the diff known, it counts the paths of the area that the diff changes.
 * The model path list alone is not a fact. A truncated diff gives a lower bound ("3+").
 */
function areaFiles(area: TriageOutput['areas'][number], stats: DiffStats | null | undefined): string {
  const known = stats?.paths && stats.paths.size > 0 ? stats.paths : null;
  if (!known) return stats?.paths ? '–' : String(new Set(area.paths).size || '–');
  const count = new Set(area.paths.filter((path) => known.has(path))).size;
  return count === 0 ? '–' : `${count}${stats?.truncated ? '+' : ''}`;
}

/** Area table: area | files | what changed. No file paths in the prose. */
export function renderChangesTable(areas: TriageOutput['areas'], options: ChangesOptions, redact: Redact): string {
  const shown = areas.slice(0, options.maxRows);
  const rows = shown.map((area) => `| ${cell(area.name, 60, redact)} | ${areaFiles(area, options.diffStats)} | ${cell(area.summary, 160, redact)} |`);
  const rest = areas.length - shown.length;
  return ['### Changes', '', '| Area | Files | What changed |', '| --- | ---: | --- |', ...rows,
    ...(rest > 0 ? [`| _+${rest} more areas_ | | |`] : [])].join('\n');
}

export const MAX_DETAILS_BODY = 1_400;

/** Room kept for the notice "_…999 more lines not shown_" and its blank line. */
const OMITTED_NOTICE_ROOM = 40;

/** Cuts one line and keeps its Markdown balanced: no half entity, no trailing backslash, no open code span. */
function cutLine(line: string, max: number, balance: boolean): string {
  if (!balance) return cut(line, max);
  let text = cut(line, max - 1).replace(/…$/, '').replace(/&[a-z]*$/i, '').replace(/\\+$/, '');
  if ((text.match(/`/g)?.length ?? 0) % 2 === 1) text += '`';
  return `${text}…`;
}

/**
 * Keeps whole lines of `body` so that the result, with its omission notice, has at most `maxBody`
 * characters. A first line that is too long is cut. The cap is strict.
 */
function fitLines(body: string, maxBody: number, balance = true): string {
  if (body.length <= maxBody) return body;
  const room = maxBody - OMITTED_NOTICE_ROOM;
  const lines = body.split('\n');
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > room) break;
    kept.push(line);
    used += line.length + 1;
  }
  if (kept.length === 0) kept.push(cutLine(lines[0], room, balance));
  const omitted = lines.length - kept.length;
  return omitted > 0 ? `${kept.join('\n')}\n\n_…${plural(omitted, 'more line')} not shown_` : kept.join('\n');
}

/** A collapsed section. The body never grows past `MAX_DETAILS_BODY` characters. */
export function details(summary: string, body: string, maxBody = MAX_DETAILS_BODY): string {
  return `<details><summary>${summary}</summary>\n\n${fitLines(body, maxBody)}\n\n</details>`;
}

/**
 * A collapsed section that shows text as it is, in a code fence. Nothing in a fence is rendered as Markdown,
 * HTML, a link or a mention, so the text needs no escaping. The fence is longer than any backtick run in it.
 */
export function fencedDetails(summary: string, raw: string, maxBody = MAX_DETAILS_BODY): string {
  const clean = raw.replace(/\r\n?/g, '\n').trim();
  const longest = Math.max(0, ...(clean.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  const inner = fitLines(clean, maxBody - 2 * fence.length - 8, false);
  return `<details><summary>${summary}</summary>\n\n${fence}text\n${inner}\n${fence}\n\n</details>`;
}

export function renderAreaDetails(areas: TriageOutput['areas'], full: boolean, redact: Redact, stats?: DiffStats | null): string | null {
  const known = stats?.paths && stats.paths.size > 0 && !stats.truncated ? stats.paths : null;
  const blocks = areas.map((area) => {
    const head = `**${plain(area.name, redact)}** — ${plain(area.summary, redact)}`;
    if (!full) return `- ${head}`;
    const bullets = area.details.map((line) => `  - ${plain(line, redact)}`);
    const paths = known ? area.paths.filter((path) => known.has(path)) : area.paths;
    const files = paths.length ? [`  - Files: ${listWithMore(paths.map((path) => code(path, redact, 70)), 5)}`] : [];
    return [`- ${head}`, ...bullets, ...files].join('\n');
  });
  return blocks.length ? details('Walkthrough by area', blocks.join('\n')) : null;
}

export function renderRiskDetails(risks: TriageOutput['risks'], limit: number, redact: Redact): string | null {
  const shown = risks.slice(0, limit);
  if (shown.length === 0) return null;
  const items = shown.map((risk, index) =>
    `${index + 1}. **${plain(risk.title, redact)}** — ${plain(risk.detail, redact)}\n   Verify: ${plain(risk.verify, redact)}`);
  const rest = risks.length - shown.length;
  return details(`Risks and what to verify (${risks.length})`, [...items, ...(rest > 0 ? [`+${rest} more`] : [])].join('\n'));
}

export function renderApiDetails(changes: TriageOutput['apiChanges'], full: boolean, redact: Redact): string | null {
  if (changes.length === 0) return null;
  const items = changes.map((change) => {
    const head = `- ${code(change.symbol, redact, 70)} · ${change.change}`;
    if (!full) return head;
    const callers = change.callers.length ? ` Callers: ${listWithMore(change.callers.map((item) => code(item, redact, 60)), 3)}.` : '';
    return `${head} — ${plain(change.impact, redact)}${callers}`;
  });
  return details(`API and contract changes (${changes.length})`, items.join('\n'));
}

export function renderTestDetails(tests: TriageOutput['tests'], redact: Redact): string {
  const gaps = tests.gaps.map((gap) => `- Gap: ${plain(gap, redact)}`);
  return details('Test coverage of this change', [plain(tests.summary, redact), ...gaps].join('\n'));
}

/** Diagnostics for incremental reviews. Only non-empty values are listed. Humans rarely need it; agents never read it. */
export function renderReviewerData(scope: WalkthroughScope | null, redact: Redact): string | null {
  if (!scope) return null;
  const lines: string[] = [];
  if (scope.previousReviewedHeadSha !== null) lines.push(`- previousReviewedHeadSha: ${code(scope.previousReviewedHeadSha, redact)}`);
  if (scope.dependentPaths.length) lines.push(`- dependentPaths (${scope.dependentPaths.length}): ${listWithMore(scope.dependentPaths.map((item) => code(item, redact, 60)), 6)}`);
  if (scope.recheckFailureIds.length) lines.push(`- recheckFailureIds (${scope.recheckFailureIds.length}): ${listWithMore(scope.recheckFailureIds.map((item) => code(item, redact, 40)), 6)}`);
  return lines.length ? details('Reviewer data', lines.join('\n')) : null;
}
