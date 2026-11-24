import 'reflect-metadata';
import type { CandidateTrace, GateResult } from '@ptah-extension/lane-routing';
import { handleRouteToolCall } from './route-tool-handlers';
import { ROUTE_DECIDE_RESULT_BUDGET } from './tool-result-budget';

const row: GateResult['roster'][number] = {
  phaseId: 'build', status: 'unavailable', executor: 'unavailable',
  exclusionReason: 'no-eligible-candidate', excludedBy: [], pinRule: null,
  needsDisclosedFallback: false, source: 'ranking', model: null, tier: 'sonnet',
  effort: 'medium', provenance: null, score: null, confidence: null,
  fallbackCause: null, reason: 'No eligible candidate',
};

type Row = GateResult['roster'][number];

function resultWith(entry: Row): GateResult {
  return {
    stage: 'gate-0.1', roster: [entry], overallSource: 'ranking',
    overallConfidence: null, excluded: [], reasons: [''],
    usage: { requests: 0, inputTokens: null, outputTokens: null, costUsd: null },
  };
}

/** Fill the exact legacy character budget with tokenizer-light text. */
async function compact(original: Row, expected: Row): Promise<Row> {
  const ideal = resultWith(expected);
  const result = resultWith(original);
  const padding = ROUTE_DECIDE_RESULT_BUDGET.chars - JSON.stringify(ideal).length;
  const word = ' routing';
  result.reasons[0] = word.repeat(Math.ceil(padding / word.length)).slice(0, padding);
  expect(JSON.stringify(result).length).toBeGreaterThan(ROUTE_DECIDE_RESULT_BUDGET.chars);
  const reply = await handleRouteToolCall({
    stage: 'gate-0.1', request: 'staff it', taskType: 'FEATURE', depth: 'Full',
    phases: [{ id: 'build', kind: 'implement' }],
  }, { decide: async () => result }, { warn: jest.fn() });
  if (reply.isError) throw new Error(reply.text);
  return (JSON.parse(reply.text) as GateResult).roster[0];
}

it('omits empty candidate arrays before dropping the explanation', async () => {
  const expected = { ...row, explanation: 'No options matched' };
  await expect(compact({ ...expected, candidates: [] }, expected)).resolves.toEqual(expected);
});

it('shortens an explanation on a code-point boundary', async () => {
  const prefix = 'x'.repeat(94);
  const expected = { ...row, explanation: `${prefix}…` };
  const original = { ...row, explanation: `${prefix}😀${' more'.repeat(20)}` };
  await expect(compact(original, expected)).resolves.toEqual(expected);
});

const excluded: CandidateTrace = {
  candidate: 'claude', displayName: 'Claude', total: null, disposition: 'excluded', rule: 'at-limit',
};

it('compacts an unavailable row with only hard exclusions', async () => {
  const expected = { ...row, explanation: 'One candidate is at limit', traceOmitted: 1 };
  const original = { ...row, explanation: expected.explanation, candidates: [excluded] };
  await expect(compact(original, expected)).resolves.toEqual(expected);
});

it('keeps omission counts when even the shortened explanation overflows', async () => {
  const original = { ...row, explanation: 'No eligible candidate. '.repeat(12), candidates: [excluded] };
  const expected = { ...row, traceOmitted: 1 };
  await expect(compact(original, expected)).resolves.toEqual(expected);
});


it('keeps the ranked runner-up ahead of an equally scored pruned candidate', async () => {
  const chosen: CandidateTrace = { candidate: 'codex', displayName: 'Codex', total: 80, disposition: 'chosen' };
  const ranked: CandidateTrace = { candidate: 'grok', displayName: 'Grok', total: 75, disposition: 'ranked' };
  const pruned: CandidateTrace = {
    candidate: 'opencode', displayName: 'OpenCode', total: 75,
    disposition: 'excluded', rule: 'pruned', cause: 'option-cap',
  };
  const expected: Row = {
    phaseId: 'build', status: 'chosen',
    executor: { kind: 'lane', id: 'codex', cli: 'codex', family: 'openai' },
    model: 'gpt-5', tier: 'sonnet', effort: 'medium', provenance: 'reported',
    score: 80, source: 'model', taskKind: 'implement', confidence: 0.9,
    fallbackCause: null, modelProposal: null, reason: 'Codex chosen',
    explanation: 'Runner-up Grok', candidates: [chosen, ranked], traceOmitted: 1,
  };
  const original = { ...expected, candidates: [chosen, ranked, pruned], traceOmitted: undefined };
  await expect(compact(original, expected)).resolves.toEqual(expected);
});
