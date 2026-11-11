import { inject, injectable } from 'tsyringe';
import { PERSISTENCE_TOKENS, type SqliteDatabase } from '@ptah-extension/persistence-sqlite';
import { ReviewFindingSchema, rightAnchorKey } from '@ptah-extension/review-contracts';
import { ReviewPolicyService } from '../review-policy.service';
import type { ReviewQueueClaim } from '../review-queue.service';
import type { VerificationResult } from '../stages/verification-stage.runner';
import type { IncrementalScope } from '../context/incremental-scope.service';
import { PublicationOutboxRepository } from './publication-outbox.repository';
import { PublicationOutboxService } from './publication-outbox.service';
import { safeText } from './publication-text';
import { escapeText, renderInline, renderSummary, type ReviewRunRow } from './review-markdown.renderer';
import { diffStats } from './walkthrough/diff-stats';
import type { TriageContent } from './walkthrough/triage-output.schema';
import { renderWalkthrough } from './walkthrough/walkthrough.renderer';

const severityRank = { Critical: 4, Major: 3, Minor: 2, Nitpick: 1 } as const;
/** Parses RIGHT-side added lines from a unified diff. */
export function rightAnchors(diff: string): ReadonlySet<string> {
  const anchors = new Set<string>();
  let path: string | null = null;
  let line = 0;
  let inHunk = false;
  for (const row of diff.split('\n')) {
    if (row.startsWith('diff --git ')) { path = null; inHunk = false; continue; }
    if (!inHunk && row.startsWith('+++ b/')) { path = row.slice(6).trim(); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) { line = Number(hunk[1]); inHunk = true; continue; }
    if (inHunk && row.startsWith('+')) { if (path) anchors.add(rightAnchorKey(path, line)); line++; }
    else if (inHunk && row.startsWith(' ')) line++;
  }
  return anchors;
}

function rightLines(diff: string): ReadonlyMap<string, string> {
  const lines = new Map<string, string>();
  let path: string | null = null;
  let line = 0;
  let inHunk = false;
  for (const row of diff.split('\n')) {
    if (row.startsWith('diff --git ')) { path = null; inHunk = false; continue; }
    if (!inHunk && row.startsWith('+++ b/')) { path = row.slice(6).trim(); continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) { line = Number(hunk[1]); inHunk = true; continue; }
    if (inHunk && row.startsWith('+')) { if (path) lines.set(rightAnchorKey(path, line), row.slice(1).replace(/\r$/, '')); line++; }
    else if (inHunk && row.startsWith(' ')) line++;
  }
  return lines;
}

@injectable()
export class ReviewPublicationService {
  constructor(
    @inject(PERSISTENCE_TOKENS.SQLITE_CONNECTION) private readonly sqlite: { readonly db: SqliteDatabase },
    @inject(PublicationOutboxService) private readonly outbox: PublicationOutboxService,
    @inject(ReviewPolicyService) private readonly policy: ReviewPolicyService,
  ) {}

  /** `walkthrough` is the triage content. A plain string is the text of an earlier-format walkthrough. */
  async publish(claim: ReviewQueueClaim, walkthrough: string | TriageContent, diff: string, verdicts: readonly VerificationResult[],
    settingsInput: unknown, baseConfig: unknown | null, secrets: readonly string[],
    scope?: IncrementalScope, signal?: AbortSignal, runRows: readonly ReviewRunRow[] = [],
    options: { readonly diffTruncated?: boolean } = {}): Promise<void> {
    const decision = claim.dryRun ? { allowed: false } : this.policy.publication(settingsInput, baseConfig, claim.repo);
    if (!decision.allowed) return;
    const settings = this.policy.effectiveSettings(settingsInput, baseConfig);
    if (!settings) throw new Error('Review publication settings unavailable');
    if (signal?.aborted) throw new Error('Review publication aborted');
    if (scope && scope.headSha !== claim.headSha) throw new Error('Incremental scope head mismatch');
    const repository = new PublicationOutboxRepository(this.sqlite.db);
    const suppressed: string[] = [];
    /** Findings of an earlier run that this run confirmed again. They are not dismissed. */
    let carriedOver = 0;
    const followUps: { findingId: string; body: string }[] = [];
    const selected: { findingId: string; candidateId: string; path: string; line: number; body: string; rank: number;
      finding: ReturnType<typeof ReviewFindingSchema.parse>; verifierFamily: string }[] = [];
    const anchorLines = rightLines(diff);
    for (const item of verdicts) {
      const output = item.result.status === 'completed' && 'verdict' in item.result.output ? item.result.output : null;
      if (scope && output?.verdict === 'disproved' && output.headSha === claim.headSha &&
        item.verification !== 'unavailable') {
        const finding = ReviewFindingSchema.parse({ ...item.finding, verification: item.verification });
        const verdict = repository.proposeIdentity(claim.attemptId, output.candidateId, finding, item.identity);
        if (verdict.relation === 'same' && verdict.priorFindingId && scope.recheckFailureIds.includes(verdict.priorFindingId)) {
          const result = repository.identity(claim.attemptId, finding, verdict, output.verifierFamily, {
            findingId: verdict.priorFindingId, status: repository.findingStatus(verdict.priorFindingId) ?? 'open', headSha: claim.headSha, checkedHeadSha: output.headSha,
            verdict: 'fixed', identity: verdict,
            failurePathEvidence: output.checkedEvidence.map(e => e.observation).join('; ').slice(0, 4000),
          });
          if (result.outcome === 'addressed' || repository.pendingFollowUp(claim.attemptId, verdict.priorFindingId) === 'addressed') followUps.push({ findingId: verdict.priorFindingId,
            body: escapeText(safeText(`Addressed ${finding.title}: ${output.reason}. Evidence: ${output.checkedEvidence.map(e => `${e.path}:${e.line} ${e.observation}`).join('; ')}`, secrets))
              + `\n<!-- ptah-review:addressed:${verdict.priorFindingId} -->` });
          continue;
        }
      }
      const reason = !output || output.verdict !== 'accepted' ? 'verifier-not-accepted'
        : output.headSha !== claim.headSha ? 'stale-verifier-head'
        : item.verification === 'unavailable' ? 'verifier-unavailable'
          : output.confidence < settings.confidenceFloor || item.finding.confidence < settings.confidenceFloor ? 'below-confidence'
            : severityRank[item.finding.severity] < severityRank[settings.minimumSeverity] ? 'below-severity' : null;
      if (reason || !output) {
        suppressed.push(`${safeText(item.finding.title, secrets)}: ${reason ?? 'verifier-unavailable'}`);
        if (output) repository.suppress(claim.attemptId, output.candidateId,
          ReviewFindingSchema.parse({ ...item.finding, verification: item.verification === 'unavailable' ? 'same-family-weaker' : item.verification }),
          reason ?? 'verifier-unavailable', output.verifierFamily);
        continue;
      }
      const finding = ReviewFindingSchema.parse({ ...item.finding, verification: item.verification });
      const verdict = repository.proposeIdentity(claim.attemptId, output.candidateId, finding, item.identity);
      const identity = repository.identity(claim.attemptId, finding, verdict, output.verifierFamily);
      if (identity.findingId === null) { suppressed.push(`${safeText(finding.title, secrets)}: identity-uncertain`); continue; }
      if (identity.outcome === 'reopened' || repository.pendingFollowUp(claim.attemptId, identity.findingId) === 'reopened') {
         followUps.push({ findingId: identity.findingId, body: escapeText(safeText(`Reopened finding ${identity.findingId}: ${finding.title}. Evidence: ${finding.evidence.map(e => `${e.path}:${e.line} ${e.excerpt}`).join('; ')}`, secrets))
          + `\n<!-- ptah-review:reopened:${identity.findingId} -->` });
        continue;
      }
      if (scope?.publishNewVerifiedRootsOnly && identity.outcome !== 'new' && repository.hasConfirmedFinding(identity.findingId)) {
        suppressed.push(`${safeText(finding.title, secrets)}: previously-identified-root`);
        carriedOver++;
        continue;
      }
      if (scope?.publishNewVerifiedRootsOnly && identity.outcome === 'new' && !scope.changedPaths.includes(finding.path) &&
        !scope.dependentPaths.includes(finding.path)) {
        suppressed.push(`${safeText(finding.title, secrets)}: outside-incremental-scope`);
        repository.suppress(claim.attemptId, output.candidateId, finding, 'outside-incremental-scope', output.verifierFamily);
        continue;
      }
      if (finding.line === null) {
        suppressed.push(`${safeText(finding.title, secrets)}: outside-diff`);
        repository.suppress(claim.attemptId, output.candidateId, finding, 'outside-diff', output.verifierFamily);
        continue;
      }
      const body = renderInline(finding, claim.repo, claim.headSha, value => safeText(value, secrets),
        anchorLines.get(rightAnchorKey(finding.path, finding.line)));
      selected.push({ findingId: identity.findingId, candidateId: output.candidateId, path: finding.path,
        line: finding.line, body, finding, verifierFamily: output.verifierFamily,
        rank: severityRank[finding.severity] * 100 + Math.round(finding.confidence * 10) + (finding.verification === 'cross-family' ? 5 : 0) });
    }
    selected.sort((a, b) => b.rank - a.rank || a.findingId.localeCompare(b.findingId));
    const anchors = rightAnchors(diff);
    const inline = selected.filter(item => anchors.has(rightAnchorKey(item.path, item.line))).slice(0, Math.min(settings.maxNewInline, 10));
    for (const item of selected) if (!inline.includes(item)) {
      suppressed.push(`${safeText(item.finding.title, secrets)}: rank-cap-or-outside-diff`);
      repository.suppress(claim.attemptId, item.candidateId, item.finding, 'rank-cap-or-outside-diff', item.verifierFamily);
    }
    const overflow = selected.filter(item => !inline.includes(item));
    const overview = renderSummary(claim.headSha, runRows, inline, suppressed.length,
      followUps.map(item => item.body), value => safeText(value, secrets))
      + (overflow.length ? `\n\n${overflow.length} additional findings held locally.` : '');
    const counts = { Critical: 0, Major: 0, Minor: 0, Nitpick: 0 };
    for (const item of selected) counts[item.finding.severity]++;
    const walkthroughBody = renderWalkthrough({
      repo: claim.repo, headSha: claim.headSha,
      content: typeof walkthrough === 'string' ? { kind: 'legacy', text: walkthrough } : walkthrough,
      lenses: runRows.map(({ lens, status }) => ({ lens, status })),
      scope: scope ?? null,
      findings: { bySeverity: counts, heldLocally: overflow.length, carriedOver,
        dismissed: Math.max(0, suppressed.length - overflow.length - carriedOver) },
      diffStats: diffStats(diff, options.diffTruncated === true),
      redact: value => safeText(value, secrets),
    });
    await this.outbox.publish({ attemptId: claim.attemptId, target: { repo: claim.repo, number: claim.prNumber, headSha: claim.headSha },
      walkthrough: safeText(walkthroughBody, secrets), overview,
      candidates: inline.map(({ findingId, path, line, body }) => ({ findingId, path, line, body })),
      followUps, validRightAnchors: anchors }, signal);
  }
}
