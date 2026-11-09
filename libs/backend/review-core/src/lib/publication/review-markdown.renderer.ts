import type { ReviewFinding, RepoIdentity } from '@ptah-extension/review-contracts';

export interface ReviewRunRow { lens: string; family: string; verdict: string }
export interface RenderedFinding { findingId: string; finding: ReviewFinding; body: string }

const badge: Record<ReviewFinding['severity'], string> = {
  Critical: '🔴 Critical', Major: '🟠 Major', Minor: '🟡 Minor', Nitpick: '🔵 Nitpick',
};

/** Model text is plain text, even when it contains Markdown or HTML syntax. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_{}()#+.!|~-])/g, '\\$1').replaceAll('[', '\\[').replaceAll(']', '\\]')
    .replace(/\r?\n/g, ' ');
}

function evidenceLink(repo: RepoIdentity, headSha: string, path: string, line: number): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${repo.owner}/${repo.name}/blob/${headSha}/${encoded}#L${line}`;
}

/** Only a single added line replacing the anchored line can use GitHub's suggestion syntax. */
function replacement(diff: string | null): string | null {
  if (!diff) return null;
  const lines = diff.trimEnd().split(/\r?\n/);
  if (lines.length !== 2 || !/^-[^-]/.test(lines[0]) || !/^\+[^+]/.test(lines[1])) return null;
  const added = lines[1].slice(1);
  return added.includes('```') || added.includes('\r') ? null : added;
}

export function renderInline(finding: ReviewFinding, repo: RepoIdentity, headSha: string): string {
  const parts = [
    `### ${badge[finding.severity]} · ${escapeText(finding.title)}`,
    `**Impact:** ${escapeText(finding.affectedBehavior)}`,
    escapeText(finding.failureMode),
    '**Evidence**',
    ...finding.evidence.map(e => `- [${escapeText(e.path)}:${e.line}](${evidenceLink(repo, headSha, e.path, e.line)}) — ${escapeText(e.excerpt)}`),
  ];
  const suggestion = finding.line !== null ? replacement(finding.suggestedDiff) : null;
  if (suggestion !== null) parts.push(`**Suggested fix**\n\n\`\`\`suggestion\n${suggestion}\n\`\`\``);
  else if (finding.suggestedDiff) parts.push(`**Proposed fix:** ${escapeText(finding.suggestedDiff)}`);
  parts.push(`<details><summary>Prompt for AI agents</summary>\n\n${escapeText(finding.fixPrompt)}\n\n</details>`);
  return parts.join('\n\n');
}

export function renderSummary(headSha: string, rows: readonly ReviewRunRow[], findings: readonly RenderedFinding[],
  suppressedCount: number, followUps: readonly string[]): string {
  const lines = [`## PtahCode review · ${headSha.slice(0, 12)}`, '',
    `${findings.length} verified findings; ${suppressedCount} held locally.`, '',
    '| Lens | Lane / family | Critical | Major | Minor | Nitpick | Verdict |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |'];
  for (const row of rows) {
    const own = findings.filter(item => item.finding.lens === row.lens);
    const count = (severity: ReviewFinding['severity']) => own.filter(item => item.finding.severity === severity).length;
    lines.push(`| ${escapeText(row.lens)} | ${escapeText(row.family)} | ${count('Critical')} | ${count('Major')} | ${count('Minor')} | ${count('Nitpick')} | ${escapeText(row.verdict)} |`);
  }
  const low = findings.filter(item => item.finding.severity === 'Minor' || item.finding.severity === 'Nitpick');
  if (low.length) lines.push('', `<details><summary>Low-severity findings (${low.length})</summary>`, '',
    ...low.map(item => `- ${badge[item.finding.severity]} ${escapeText(item.finding.title)}`), '', '</details>');
  if (followUps.length) lines.push('', `### Finding follow-ups (${followUps.length})`, '', ...followUps.map(item => `- ${item}`));
  lines.push('', '<details><summary>Run metadata</summary>', '', `Head: \`${headSha}\`  `,
    'Usage: unavailable', '', '</details>');
  return lines.join('\n');
}
