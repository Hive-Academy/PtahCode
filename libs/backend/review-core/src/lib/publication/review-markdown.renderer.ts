import type { ReviewFinding, RepoIdentity } from '@ptah-extension/review-contracts';

export interface ReviewRunRow { lens: string; family: string; status: string }
export interface RenderedFinding { findingId: string; finding: ReviewFinding; body: string }

const badge: Record<ReviewFinding['severity'], string> = {
  Critical: '🔴 Critical', Major: '🟠 Major', Minor: '🟡 Minor', Nitpick: '🔵 Nitpick',
};

/** Model text is plain text, even when it contains Markdown or HTML syntax. */
export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_{}()#+.!|~-])/g, '\\$1').replaceAll('[', '\\[').replaceAll(']', '\\]')
    .replace(/\r?\n/g, ' ');
}

function evidenceLink(repo: RepoIdentity, headSha: string, path: string, line: number): string {
  const encoded = path.split('/').map(part => encodeURIComponent(part).replace(/\(/g, '%28').replace(/\)/g, '%29')).join('/');
  return `https://github.com/${repo.owner}/${repo.name}/blob/${headSha}/${encoded}#L${line}`;
}

/** Only a single added line replacing the anchored line can use GitHub's suggestion syntax. */
function replacement(diff: string | null, anchoredLine: string | undefined): string | null {
  if (!diff) return null;
  const lines = diff.trimEnd().split(/\r?\n/);
  if (lines.length !== 2 || !lines[0].startsWith('-') || !lines[1].startsWith('+')) return null;
  const added = lines[1].slice(1);
  if (anchoredLine === undefined || lines[0].slice(1) !== anchoredLine) return null;
  return added.includes('```') || added.includes('\r') || added.includes('<!--') || added.includes('ptah-review:') ? null : added;
}

export function renderInline(finding: ReviewFinding, repo: RepoIdentity, headSha: string,
  redact: (value: string) => string = value => value, anchoredLine?: string): string {
  const safe = (value: string) => escapeText(redact(value));
  const parts = [
    `### ${badge[finding.severity]} · ${safe(finding.title)}`,
    `**Impact:** ${safe(finding.affectedBehavior)}`,
    safe(finding.failureMode),
    '**Evidence**',
    ...finding.evidence.map(e => {
      const path = redact(e.path);
      const label = `${safe(e.path)}:${e.line}`;
      return `- ${path === e.path ? `[${label}](${evidenceLink(repo, headSha, path, e.line)})` : label} — ${safe(e.excerpt)}`;
    }),
  ];
  const candidate = finding.line !== null ? replacement(finding.suggestedDiff, anchoredLine) : null;
  const suggestion = candidate !== null && redact(candidate) === candidate ? candidate : null;
  if (suggestion !== null) parts.push(`**Suggested fix**\n\n\`\`\`suggestion\n${suggestion}\n\`\`\``);
  else if (finding.suggestedDiff) parts.push(`**Proposed fix:** ${safe(finding.suggestedDiff)}`);
  parts.push(`<details><summary>Prompt for AI agents</summary>\n\n${safe(finding.fixPrompt)}\n\n</details>`);
  return parts.join('\n\n');
}

export function renderSummary(headSha: string, rows: readonly ReviewRunRow[], findings: readonly RenderedFinding[],
  suppressedCount: number, followUps: readonly string[], redact: (value: string) => string = value => value): string {
  const safe = (value: string) => escapeText(redact(value));
  const lines = [`## PtahCode review · ${headSha.slice(0, 12)}`, '',
    `${findings.length} verified findings; ${suppressedCount} held locally.`, '',
    '| Lens | Lane / family | Critical | Major | Minor | Nitpick | Lane status |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |'];
  for (const row of rows) {
    const own = findings.filter(item => item.finding.lens === row.lens);
    const count = (severity: ReviewFinding['severity']) => own.filter(item => item.finding.severity === severity).length;
    lines.push(`| ${safe(row.lens)} | ${safe(row.family)} | ${count('Critical')} | ${count('Major')} | ${count('Minor')} | ${count('Nitpick')} | ${safe(row.status)} |`);
  }
  const low = findings.filter(item => item.finding.severity === 'Minor' || item.finding.severity === 'Nitpick');
  if (low.length) lines.push('', `<details><summary>Low-severity findings (${low.length})</summary>`, '',
    ...low.map(item => `- ${badge[item.finding.severity]} ${safe(item.finding.title)}`), '', '</details>');
  // Follow-up model text is escaped by the service before its trusted marker is appended.
  if (followUps.length) lines.push('', `### Finding follow-ups (${followUps.length})`, '', ...followUps.map(item => `- ${item}`));
  lines.push('', '<details><summary>Run metadata</summary>', '', `Head: \`${headSha}\`  `,
    'Usage: unavailable', '', '</details>');
  return lines.join('\n');
}
