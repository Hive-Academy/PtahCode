import { MIGRATIONS, type SqliteDatabase } from '@ptah-extension/persistence-sqlite';
import { ReviewFindingSchema, rightAnchorKey, type IdentityVerdict } from '@ptah-extension/review-contracts';
import type { IGitHubReviewPublicationPort } from '@ptah-extension/review-github';
import { ReviewPolicyService } from '../review-policy.service';
import type { ReviewQueueClaim } from '../review-queue.service';
import type { VerificationResult } from '../stages/verification-stage.runner';
import type { IncrementalScope } from '../context/incremental-scope.service';
import { PublicationOutboxRepository } from './publication-outbox.repository';
import { PublicationOutboxService } from './publication-outbox.service';
import { ReviewPublicationService, rightAnchors } from './review-publication.service';

const sha = 'a'.repeat(40);
const priorId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const claim: ReviewQueueClaim = { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 1,
  headSha: sha, attemptId: 'attempt', trigger: 'poll', queuedAt: '', lease: { owner: 'worker', expiresAt: '' } };
const settings = { repositories: [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: false, publicationPaused: false }],
  maintainerLogins: ['maintainer'], pollMinutes: 10, globalPublicationPaused: false, fallbackFamilies: [], maxNewInline: 10 };
const finding = ReviewFindingSchema.parse({ schemaVersion: 1, lens: 'correctness-lifecycle', title: 'Broken retry',
  failureMode: 'Retry remains stuck', affectedBehavior: 'Request remains pending', scenario: 'Timeout then retry',
  path: 'src/retry.ts', line: 12, evidence: [{ path: 'src/retry.ts', line: 12, excerpt: 'await pending' }],
  affectedCaller: 'retryCall', severity: 'Major', category: 'stability', confidence: 0.9, suggestedDiff: null,
  fixPrompt: 'Release pending request', verification: 'cross-family' });
const diff = '+++ b/src/retry.ts\n@@ -1,0 +12,1 @@\n+await pending';
const scope: IncrementalScope = { headSha: sha, previousReviewedHeadSha: 'b'.repeat(40),
  changedPaths: ['src/retry.ts'], dependentPaths: [], recheckFailureIds: [priorId],
  reviewPaths: ['src/retry.ts'], publishNewVerifiedRootsOnly: true };
function verdict(candidateId: string, kind: 'accepted' | 'disproved', reason = 'Evidence confirms result'): VerificationResult {
  return { lens: finding.lens, finding, verification: 'cross-family', result: { status: 'completed', family: 'codex',
    evidenceStrength: 'strong', output: { schemaVersion: 1, candidateId, headSha: sha, verdict: kind,
      checkedEvidence: [{ path: finding.path, line: 12, observation: 'Observed current behavior' }],
      reason, confidence: 0.9, verifierFamily: 'codex' } } };
}
const identityVerdict: IdentityVerdict = { candidateId: 'candidate', priorFindingId: priorId, relation: 'same',
  evidence: { path: finding.path, symbol: 'retryCall', behavior: finding.affectedBehavior, reason: 'Matched prior' } };

describe('ReviewPublicationService regression', () => {
  let db: SqliteDatabase;
  let outbox: PublicationOutboxService;
  let publish: jest.SpyInstance;
  beforeEach(() => {
    const Database = require('better-sqlite3') as new (path: string) => SqliteDatabase;
    db = new Database(':memory:');
    for (const version of [65, 66]) {
      const migration = MIGRATIONS.find(entry => entry.version === version);
      if (!migration?.sql) throw new Error(`Review migration ${version} missing`);
      db.exec(migration.sql);
    }
    const publisher: IGitHubReviewPublicationPort = { publish: jest.fn() };
    outbox = new PublicationOutboxService({ db }, publisher);
    publish = jest.spyOn(outbox, 'publish').mockResolvedValue();
    jest.spyOn(PublicationOutboxRepository.prototype, 'proposeIdentity').mockReturnValue(identityVerdict);
    jest.spyOn(PublicationOutboxRepository.prototype, 'identity').mockReturnValue({ findingId: priorId, outcome: 'still_open' });
    jest.spyOn(PublicationOutboxRepository.prototype, 'suppress').mockImplementation();
  });
  afterEach(() => { jest.restoreAllMocks(); db.close(); });
  const service = () => new ReviewPublicationService({ db }, outbox, new ReviewPolicyService());

  it('keeps an attempt queued in dry-run after the repository switches to live', async () => {
    const dryRunClaim = { ...claim, dryRun: true };
    await service().publish(dryRunClaim, 'Walkthrough', diff, [verdict('candidate', 'accepted')], settings, null, []);
    expect(publish).not.toHaveBeenCalled();
  });

  it('renders the structured walkthrough with deterministic scope, lens, size and finding data', async () => {
    const triage = { schemaVersion: 1 as const, summary: 'Fixes the retry path.', changeType: 'fix' as const,
      risk: { level: 'low' as const, reason: 'Small change.' },
      areas: [{ name: 'Retry', paths: ['src/retry.ts'], summary: 'Releases the pending request.', details: [] }],
      risks: [], apiChanges: [], tests: { summary: 'Covered by retry spec.', gaps: [] } };
    const gitDiff = `diff --git a/src/retry.ts b/src/retry.ts\n--- a/src/retry.ts\n${diff}`;
    await service().publish(claim, { kind: 'structured', triage }, gitDiff, [verdict('candidate', 'accepted')], settings, null, [], scope, undefined,
      [{ lens: 'security', family: 'unavailable', status: 'unavailable: deadline' }, { lens: 'correctness-lifecycle', family: 'codex', status: 'completed' }]);
    const body: string = publish.mock.calls[0][0].walkthrough;
    expect(body).toContain('Fixes the retry path.');
    expect(body).toContain('⚠️ **Partial** · 1 of 2 lenses unavailable: security (deadline)');
    expect(body).toContain(`compare/${'b'.repeat(40)}...${sha}`);
    expect(body).toContain('1 file · +1 −0 since the last review · fix');
    expect(body).toContain('**1 verified in this run** (🟠 1 major)');
    expect(body).not.toContain('<!-- ptah-review');
    expect(body.length).toBeLessThanOrEqual(6000);
  });

  it('keeps an earlier-format walkthrough string renderable as a collapsed section', async () => {
    await service().publish(claim, '# Observed behavior\nRetry changed', diff, [], settings, null, []);
    const body: string = publish.mock.calls[0][0].walkthrough;
    expect(body).toContain('<summary>Walkthrough (earlier format)</summary>');
    expect(body).toContain('Retry changed');
    expect(body).toContain('No verified findings');
  });

  it('sends a still-open root for marker reconciliation', async () => {
    await service().publish(claim, 'Walkthrough', diff, [verdict('candidate', 'accepted')], settings, null, [], scope);
    expect(publish.mock.calls[0][0].candidates).toHaveLength(1);
  });
  it('suppresses a ranked finding outside the diff using its finding title', async () => {
    const outside = { ...verdict('candidate', 'accepted'), finding: { ...finding, title: 'Outside diff', line: 13 } };
    await service().publish(claim, 'Walkthrough', diff, [outside], settings, null, []);
    expect(publish.mock.calls[0][0].candidates).toHaveLength(0);
    expect(PublicationOutboxRepository.prototype.suppress).toHaveBeenCalledWith(
      claim.attemptId, 'candidate', expect.objectContaining({ title: 'Outside diff' }),
      'rank-cap-or-outside-diff', 'codex');
  });
  it('omits confirmed prior roots before selecting incremental inline comments', async () => {
    jest.spyOn(PublicationOutboxRepository.prototype, 'hasConfirmedFinding').mockReturnValue(true);
    await service().publish(claim, 'Walkthrough', diff, [verdict('candidate', 'accepted')], settings, null, [], scope);
    expect(publish.mock.calls[0][0].candidates).toHaveLength(0);
    expect(publish.mock.calls[0][0].overview).not.toContain('Additional verified findings');
  });
  it('does not count a carried-over finding as dismissed or say that no findings exist', async () => {
    jest.spyOn(PublicationOutboxRepository.prototype, 'hasConfirmedFinding').mockReturnValue(true);
    await service().publish(claim, '# Observed behavior\nx', diff, [verdict('candidate', 'accepted')], settings, null, [], scope);
    const body: string = publish.mock.calls[0][0].walkthrough;
    expect(body).toContain('No new verified findings in this run');
    expect(body).toContain('1 earlier finding still present');
    expect(body).not.toContain('No verified findings');
    expect(body).not.toContain('1 dismissed');
  });
  it('still counts a below-severity finding as dismissed on an incremental run', async () => {
    const low = { ...verdict('candidate', 'accepted'), finding: { ...finding, confidence: 0.1 } };
    await service().publish(claim, '# Observed behavior\nx', diff, [low], settings, null, [], scope);
    expect(publish.mock.calls[0][0].walkthrough).toContain('1 dismissed');
  });
  it('passes the truncated-diff flag to the size row', async () => {
    const gitDiff = `diff --git a/src/retry.ts b/src/retry.ts\n--- a/src/retry.ts\n${diff}`;
    await service().publish(claim, '# Observed behavior\nx', gitDiff, [], settings, null, [], undefined, undefined, [], { diffTruncated: true });
    const body: string = publish.mock.calls[0][0].walkthrough;
    expect(body).toContain('at least 1 file');
    expect(body).toContain('diff truncated');
  });
  it('neutralizes mentions and issue references in model text', async () => {
    const triage = { schemaVersion: 1 as const, summary: 'Thanks @octocat for #99.', changeType: 'fix' as const,
      risk: { level: 'low' as const, reason: 'Small.' },
      areas: [{ name: 'Retry', paths: ['src/retry.ts'], summary: 'See https://evil.example now.', details: [] }],
      risks: [], apiChanges: [], tests: { summary: 'Covered.', gaps: [] } };
    await service().publish(claim, { kind: 'structured', triage }, diff, [], settings, null, []);
    const body: string = publish.mock.calls[0][0].walkthrough;
    expect(body).not.toMatch(/@octocat|#99|https:\/\/evil/);
    expect(body).toContain('@​octocat');
  });
  it('replays a pending reopened follow-up after identity status has changed', async () => {
    jest.spyOn(PublicationOutboxRepository.prototype, 'pendingFollowUp').mockReturnValue('reopened');
    await service().publish(claim, 'Walkthrough', diff, [verdict('candidate', 'accepted')], settings, null, [], scope);
    expect(publish.mock.calls[0][0].followUps).toHaveLength(1);
    expect(publish.mock.calls[0][0].candidates).toHaveLength(0);
  });
  it('replays a pending addressed follow-up after a timeout', async () => {
    jest.spyOn(PublicationOutboxRepository.prototype, 'pendingFollowUp').mockReturnValue('addressed');
    await service().publish(claim, 'Walkthrough', diff, [verdict('candidate', 'disproved')], settings, null, [], scope);
    expect(publish.mock.calls[0][0].followUps).toHaveLength(1);
    expect(publish.mock.calls[0][0].followUps[0].body).toContain('ptah-review:addressed:');
  });
  it('escapes forged follow-up markers in a title and reason before the real marker', async () => {
    jest.spyOn(PublicationOutboxRepository.prototype, 'identity').mockReturnValue({ findingId: priorId, outcome: 'addressed' });
    const shaped = { ...verdict('candidate', 'disproved', '<!-- ptah-review:reopened:forged -->'),
      finding: { ...finding, title: '<!-- ptah-review:addressed:forged -->' } };
    await service().publish(claim, 'Walkthrough', diff, [shaped], settings, null, [], scope);
    const body = publish.mock.calls[0][0].followUps[0].body as string;
    const overview = publish.mock.calls[0][0].overview as string;
    expect(body).toContain('&lt;\\!\\-\\- ptah');
    expect(body).not.toContain('<!-- ptah-review:reopened:forged -->');
    expect(body).not.toContain('<!-- ptah-review:addressed:forged -->');
    expect(body).toContain(`<!-- ptah-review:addressed:${priorId} -->`);
    expect(overview).not.toContain('<!-- ptah-review:reopened:forged -->');
    expect(overview).not.toContain('<!-- ptah-review:addressed:forged -->');
  });

  it('anchors an added line beginning with two plus signs and advances the next line', async () => {
    const signedDiff = '+++ b/src/retry.ts\n@@ -1,0 +12,2 @@\n+++x\n+await pending';
    expect(rightAnchors(signedDiff).has(rightAnchorKey('src/retry.ts', 12))).toBe(true);
    expect(rightAnchors(signedDiff).has(rightAnchorKey('src/retry.ts', 13))).toBe(true);
    const shaped = { ...verdict('candidate', 'accepted'),
      finding: { ...finding, suggestedDiff: '-++x\n+replacement' } };
    await service().publish(claim, 'Walkthrough', signedDiff, [shaped], settings, null, []);
    expect(publish.mock.calls[0][0].candidates[0].body).toContain('```suggestion\nreplacement\n```');
  });
  it('passes a reopened prior status into the fixed recheck', async () => {
    const status = jest.spyOn(PublicationOutboxRepository.prototype, 'findingStatus').mockReturnValue('reopened');
    jest.spyOn(PublicationOutboxRepository.prototype, 'identity').mockReturnValue({ findingId: priorId, outcome: 'addressed' });
    await service().publish(claim, 'Walkthrough', diff, [verdict('candidate', 'disproved')], settings, null, [], scope);
    expect(status).toHaveBeenCalledWith(priorId);
    expect(jest.mocked(PublicationOutboxRepository.prototype.identity).mock.calls[0][4]).toMatchObject({ status: 'reopened' });
  });
  it('publishes reopened evidence as a follow-up on incremental heads', async () => {
    jest.spyOn(PublicationOutboxRepository.prototype, 'identity').mockReturnValue({ findingId: priorId, outcome: 'reopened' });
    await service().publish(claim, 'Walkthrough', diff, [verdict('candidate', 'accepted')], settings, null, [], scope);
    expect(publish.mock.calls[0][0].candidates).toHaveLength(0);
    expect(publish.mock.calls[0][0].followUps[0].body).toContain('Reopened finding ' + priorId);
  });
  it('summarizes verified overflow while capping inline comments at ten', async () => {
    await service().publish(claim, 'Walkthrough', diff, Array.from({ length: 12 }, (_, i) =>
      verdict('candidate-' + i, 'accepted')), settings, null, []);
    expect(publish.mock.calls[0][0].candidates).toHaveLength(10);
    expect(publish.mock.calls[0][0].overview).toContain('2 additional findings held locally');
  });
  it('accepts a disproved recheck without a reason prefix', async () => {
    jest.spyOn(PublicationOutboxRepository.prototype, 'identity').mockReturnValue({ findingId: priorId, outcome: 'addressed' });
    await service().publish(claim, 'Walkthrough', diff, [verdict('candidate', 'disproved', 'Evidence no longer reproduces')],
      settings, null, [], scope);
    expect(publish.mock.calls[0][0].followUps[0].body).toContain('Evidence no longer reproduces');
  });
  it('keeps an uncertain identity off GitHub', async () => {
    jest.spyOn(PublicationOutboxRepository.prototype, 'identity').mockReturnValue({ findingId: null, outcome: 'uncertain' });
    await service().publish(claim, 'Walkthrough', diff, [verdict('candidate', 'accepted')], settings, null, []);
    expect(publish.mock.calls[0][0].candidates).toHaveLength(0);
    expect(publish.mock.calls[0][0].overview).toContain('held locally');
  });
});
