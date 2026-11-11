import type { RepoIdentity } from '@ptah-extension/review-contracts';
import type { DiffStats } from './diff-stats';
import { renderSequenceDiagram } from './mermaid-sequence';
import type { TriageContent, TriageOutput } from './triage-output.schema';
import {
  fencedDetails,
  MAX_DETAILS_BODY,
  MAX_TOP_BLOCK,
  renderApiDetails,
  renderAreaDetails,
  renderChangesTable,
  renderReviewerData,
  renderRiskDetails,
  renderTestDetails,
  renderTopBlock,
  type WalkthroughFindingCounts,
  type WalkthroughLens,
  type WalkthroughScope,
} from './walkthrough-sections';
import { identityRedact, plain, type Redact } from './walkthrough-text';

/** Size budget of the walkthrough comment. Tests enforce it. */
export const WALKTHROUGH_BUDGET = {
  topBlock: MAX_TOP_BLOCK,
  total: 6_000,
  detailsBody: MAX_DETAILS_BODY,
  changesRows: 10,
  changeCell: 160,
} as const;

export interface WalkthroughRenderInput {
  readonly repo: RepoIdentity;
  readonly headSha: string;
  readonly content: TriageContent;
  readonly lenses: readonly WalkthroughLens[];
  readonly scope: WalkthroughScope | null;
  readonly findings: WalkthroughFindingCounts;
  readonly diffStats: DiffStats | null;
  readonly redact?: Redact;
}

/** Each level removes more detail. Only the last resort drops the Changes table, and it says so. */
const LAST_LEVEL = 8;
const TRUNCATION_NOTICE = '_Details were left out to keep this comment short. See the review thread for findings._';

/** An earlier-format walkthrough is shown as it is, in a code fence, so its own code and diagrams stay intact. */
function legacySection(text: string, redact: Redact): string {
  return fencedDetails('Walkthrough (earlier format)', redact(text));
}

function structuredBody(triage: TriageOutput, input: WalkthroughRenderInput, level: number, redact: Redact): string {
  const parts: string[] = [renderChangesTable(triage.areas,
    { maxRows: level >= 7 ? 6 : WALKTHROUGH_BUDGET.changesRows, diffStats: input.diffStats }, redact)];
  const diagram = level < 6 && triage.diagram ? renderSequenceDiagram(triage.diagram, redact) : null;
  if (diagram) parts.push(`### Flow\n\n${plain(triage.diagram?.title ?? '', redact)}\n\n${diagram}`);
  if (level >= LAST_LEVEL) {
    parts.push(TRUNCATION_NOTICE);
    return parts.join('\n\n');
  }
  const sections = [
    renderAreaDetails(triage.areas, level < 3, redact, input.diffStats),
    renderRiskDetails(triage.risks, level >= 5 ? 4 : triage.risks.length, redact),
    renderApiDetails(triage.apiChanges, level < 4, redact),
    level < 2 ? renderTestDetails(triage.tests, redact) : null,
    level < 1 ? renderReviewerData(input.scope, redact) : null,
  ];
  for (const section of sections) if (section) parts.push(section);
  return parts.join('\n\n');
}

/**
 * Renders the PR walkthrough comment. The model supplies data only. Layout, counts, links and
 * status come from code. The result never contains a ptah-review marker: the publication adapter adds it.
 */
export function renderWalkthrough(input: WalkthroughRenderInput): string {
  const redact = input.redact ?? identityRedact;
  const structured = input.content.kind === 'structured' ? input.content.triage : null;
  const top = renderTopBlock({
    repo: input.repo,
    headSha: input.headSha,
    summary: structured ? structured.summary : 'The structured walkthrough is not available for this review.',
    changeType: structured ? structured.changeType : null,
    risk: structured ? structured.risk : null,
    lenses: input.lenses,
    scope: input.scope,
    diffStats: input.diffStats,
    findings: input.findings,
    redact,
  });
  if (input.content.kind === 'unavailable') return top;
  if (input.content.kind === 'legacy') {
    const text = `${top}\n\n${legacySection(input.content.text, redact)}`;
    return text.length <= WALKTHROUGH_BUDGET.total ? text : `${top}\n\n${TRUNCATION_NOTICE}`;
  }
  const triage = input.content.triage;
  for (let level = 0; level <= LAST_LEVEL; level++) {
    const text = `${top}\n\n${structuredBody(triage, input, level, redact)}`;
    if (text.length <= WALKTHROUGH_BUDGET.total) return text;
  }
  return `${top}\n\n${TRUNCATION_NOTICE}`;
}
