import type { LaneLimitState } from '@ptah-extension/shared';
import {
  ChosenEntrySchema,
  EXCLUSION_RULES,
  FALLBACK_CAUSES,
  PreflightResultSchema,
  UnavailableEntrySchema,
} from '../contracts/route-decide-result.schema';
import type { MatrixCell } from '../matrix/matrix.types';
import { withPolicyReason } from '../pipeline/assemble-gate';
import {
  MISSING_INPUT_REASON,
  MISSING_INPUTS,
  NO_CONFIDENCE_REPORTED,
  compileChosenExplanation,
  compileChosenReason,
  compileGateReasons,
  compilePreflightReasons,
  compileResultReasons,
  compileUnavailableExplanation,
  compileUnavailableReason,
  formatLimitAge,
  type ChosenExecutor,
  type ChosenReasonInput,
  type UnavailableReasonInput,
} from './compile-reasons';

const SEED_URL = 'https://datasets.example/swe-bench-verified';
const SEED_NOTE = 'MEASURES-BACKEND-ONLY';
const USER_URL = 'https://user.example/edit';
const LOCAL_URL = 'https://datasets.example/local-must-not-leak';
const MODEL_TEXT = 'MODEL-FREE-TEXT-9f3a';
const PROPOSAL = 'UNTRUSTED-PROPOSAL';

const usage = {
  requests: 0,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
};

const LIMIT_STATES = [
  'at-limit',
  'near-limit',
  'confirmed-room',
  'unknown',
] as const satisfies readonly LaneLimitState[];

function lane(id: string): ChosenExecutor {
  return { kind: 'lane', id, cli: id, family: id };
}

function seedCell(stale: boolean): MatrixCell {
  return {
    kind: 'value',
    score: 80,
    source: 'seed',
    sourceRef: SEED_URL,
    asOf: '2026-02-19',
    stale,
    note: SEED_NOTE,
  };
}

function userCell(): MatrixCell {
  return {
    kind: 'value',
    score: 70,
    source: 'user',
    sourceRef: USER_URL,
    asOf: '2026-04-02',
    stale: false,
  };
}

function localCell(sampleCount?: number): MatrixCell {
  return {
    kind: 'value',
    score: 65,
    source: 'local',
    sourceRef: LOCAL_URL,
    asOf: '2026-10-01T00:00:00.000Z',
    stale: false,
    ...(sampleCount !== undefined ? { sampleCount } : {}),
  };
}

function chosen(
  overrides: Partial<Omit<ChosenReasonInput, 'executor' | 'cell'>> & {
    readonly executor?: ChosenExecutor;
    readonly cell?: MatrixCell;
  } = {},
): ChosenReasonInput {
  const cell = overrides.cell ?? { kind: 'unknown' };
  const score = overrides.score ?? (cell.kind === 'value' ? cell.score : 50);
  return {
    phaseId: overrides.phaseId ?? 'implement',
    executor: overrides.executor ?? lane('grok'),
    model: overrides.model ?? 'grok-4',
    score,
    ...(overrides.parts !== undefined ? { parts: overrides.parts } : {}),
    ...(overrides.effortCheck !== undefined ? { effortCheck: overrides.effortCheck } : {}),
    source: overrides.source ?? 'ranking',
    cell,
    limitState: overrides.limitState ?? 'confirmed-room',
    rotationChangedChoice: overrides.rotationChangedChoice ?? false,
    preferenceChangedChoice: overrides.preferenceChangedChoice ?? false,
    ...(overrides.preferenceSource !== undefined
      ? { preferenceSource: overrides.preferenceSource }
      : {}),
    reportedConfidence:
      overrides.reportedConfidence === undefined
        ? null
        : overrides.reportedConfidence,
    fallbackCause:
      overrides.fallbackCause === undefined ? null : overrides.fallbackCause,
    inputRowIds: overrides.inputRowIds ?? ['grok', 'codex'],
    ...(overrides.discardedModelText !== undefined
      ? { discardedModelText: overrides.discardedModelText }
      : {}),
    ...(overrides.modelProposalOption !== undefined
      ? { modelProposalOption: overrides.modelProposalOption }
      : {}),
  };
}

function namedCandidates(text: string): string[] {
  const names: string[] = [];
  for (const clause of text.split('; ')) {
    const executor = /^executor (?:lane|subagent) (\S+)$/.exec(clause);
    if (executor?.[1] !== undefined) {
      names.push(executor[1]);
      continue;
    }
    const excluded = /^candidate (.+) excluded by [a-z-]+$/.exec(clause);
    if (excluded?.[1] !== undefined) {
      names.push(excluded[1]);
    }
  }
  return names;
}

function namedTopLevel(line: string): string | null {
  const excluded = /^phase \S+ candidate (.+) excluded by [a-z-]+$/.exec(line);
  return excluded?.[1] ?? null;
}

function expectProvenance(cell: MatrixCell, reason: string): void {
  if (cell.kind === 'unknown') {
    expect(reason).toContain('no profile');
    expect(reason).not.toContain('provenance seed');
    expect(reason).not.toContain('provenance user');
    expect(reason).not.toContain('provenance local');
    return;
  }
  expect(reason).toContain(`provenance ${cell.source}`);
  if (cell.source === 'seed') {
    expect(reason).toContain(`asOf ${cell.asOf}`);
    expect(reason).toContain(`stale ${cell.stale}`);
  } else {
    expect(reason).not.toContain('asOf');
    expect(reason).not.toContain(cell.asOf);
  }
  if (cell.source === 'local') {
    expect(reason).toContain(`sample count ${cell.sampleCount}`);
  }
  if (cell.sourceRef !== undefined) {
    expect(reason).not.toContain(cell.sourceRef);
  }
  if (cell.note !== undefined) {
    expect(reason).not.toContain(cell.note);
  }
}

function expectChosenFacts(input: ChosenReasonInput): void {
  const reason = compileChosenReason(input);
  expect(reason).toContain(`phase ${input.phaseId}`);
  expect(reason).toContain(
    `executor ${input.executor.kind} ${input.executor.id}`,
  );
  expect(reason).toContain(`model ${input.model}`);
  expect(reason).toContain(`score ${input.score}`);
  expect(reason).toContain(`limit state ${input.limitState}`);
  expect(reason).toContain(
    input.rotationChangedChoice
      ? 'rotation changed the choice'
      : 'rotation did not change the choice',
  );
  expect(reason).toContain(
    input.preferenceChangedChoice
      ? 'preference changed the choice'
      : 'preference did not change the choice',
  );
  if (
    input.preferenceSource !== undefined &&
    input.preferenceSource.trim() !== ''
  ) {
    expect(reason).toContain(
      `preference source ${input.preferenceSource.trim()}`,
    );
  }
  expectProvenance(input.cell, reason);
  if (input.source === 'model') {
    if (input.reportedConfidence === null) {
      expect(reason).toContain(NO_CONFIDENCE_REPORTED);
      expect(reason).not.toContain('model probability');
    } else {
      expect(reason).toContain(
        `model probability ${JSON.stringify(input.reportedConfidence)}`,
      );
      expect(reason).not.toContain(NO_CONFIDENCE_REPORTED);
    }
  } else {
    expect(reason).toContain('model probability not applicable');
    expect(reason).not.toContain(NO_CONFIDENCE_REPORTED);
    if (input.reportedConfidence !== null) {
      expect(reason).not.toContain(JSON.stringify(input.reportedConfidence));
    }
  }
  expect(reason).toContain(`fallback cause ${input.fallbackCause ?? 'none'}`);
  if (input.discardedModelText !== undefined) {
    expect(reason).not.toContain(input.discardedModelText);
  }
  if (input.modelProposalOption !== undefined) {
    expect(reason).not.toContain(input.modelProposalOption);
  }
  expect(namedCandidates(reason)).toEqual([input.executor.id]);
  for (const id of namedCandidates(reason)) {
    expect(input.inputRowIds).toContain(id);
  }
}

describe('requirement 13.1', () => {
  it('drops structured-output free text and the proposal label from a chosen reason', () => {
    const base = chosen({
      source: 'model',
      reportedConfidence: null,
      modelProposalOption: PROPOSAL,
    });
    const withText = compileChosenReason({
      ...base,
      discardedModelText: MODEL_TEXT,
    });
    expect(withText).toBe(compileChosenReason(base));
    expect(withText).not.toContain(MODEL_TEXT);
    expect(withText).not.toContain(PROPOSAL);
  });

  it('drops structured-output free text from an unavailable reason', () => {
    const base: UnavailableReasonInput = {
      phaseId: 'implement',
      exclusionReason: 'no-eligible-candidate',
      excludedBy: [{ candidate: 'codex', rule: 'at-limit' }],
      pinRule: null,
      needsDisclosedFallback: false,
      source: 'ranking',
      inputRowIds: ['codex'],
      modelProposalOption: PROPOSAL,
    };
    const withText = compileUnavailableReason({
      ...base,
      discardedModelText: MODEL_TEXT,
    });
    expect(withText).toBe(compileUnavailableReason(base));
    expect(withText).not.toContain(MODEL_TEXT);
    expect(withText).not.toContain(PROPOSAL);
  });

  it('drops structured-output free text from pre-flight reasons', () => {
    const reasons = compilePreflightReasons({
      answers: [
        {
          name: 'taskType',
          source: 'model',
          reportedConfidence: null,
          fallbackCause: null,
          discardedModelText: MODEL_TEXT,
          modelProposalOption: PROPOSAL,
        },
        {
          name: 'depth',
          source: 'model',
          reportedConfidence: null,
          fallbackCause: null,
        },
      ],
      missingInputs: [],
    });
    const text = reasons.join('\n');
    expect(text).not.toContain(MODEL_TEXT);
    expect(text).not.toContain(PROPOSAL);
    expect(text).toContain(NO_CONFIDENCE_REPORTED);
  });
});

describe('requirement 13.2 chosen facts', () => {
  it('states seed provenance with asOf and stale and omits the dataset URL', () => {
    const reason = compileChosenReason(chosen({ cell: seedCell(true) }));
    expect(reason).toBe(
      [
        'phase implement',
        'executor lane grok',
        'model grok-4',
        'score 80',
        'provenance seed, asOf 2026-02-19, stale true',
        'limit state confirmed-room',
        'rotation did not change the choice',
        'preference did not change the choice',
        'model probability not applicable',
        'fallback cause none',
      ].join('; '),
    );
    expect(reason).not.toContain(SEED_URL);
    expect(reason).not.toContain(SEED_NOTE);
    expect(reason).not.toContain('sourceRef');
  });

  it('states a fresh seed cell as stale false', () => {
    const reason = compileChosenReason(chosen({ cell: seedCell(false) }));
    expect(reason).toContain('provenance seed, asOf 2026-02-19, stale false');
    expect(reason).not.toContain('stale true');
    expect(reason).not.toContain(SEED_URL);
  });

  const scoreParts = { prior: 80, learned: 0, preference: 0, limit: 0 };

  it('states the chosen model and effort with evidence and samples', () => {
    const reason = compileChosenReason(chosen({
      parts: { ...scoreParts, effort: 'high', evidence: 'pair', sampleCount: 7 },
    }));
    expect(reason).toContain('; model grok-4 effort high (pair, 7 samples); score ');
    expect(reason).not.toContain('; explore ');
  });

  it('reports the explored pair and the configured exploration cadence', () => {
    const reason = compileChosenReason(chosen({
      parts: { ...scoreParts, effort: 'low', evidence: 'prior', sampleCount: 0, explore: true },
    }));
    expect(reason).toContain('; model grok-4 effort low (prior, 0 samples);');
    expect(reason).toContain('; explore grok-4/low: 0/3 samples, 1 of every 5 routed runs');
  });

  it.each([undefined, { ...scoreParts, effort: 'high', evidence: 'pair' } as const])(
    'discloses unsupported native effort with score parts %p',
    (parts) => {
      const reason = compileChosenReason(chosen({
        ...(parts === undefined ? {} : { parts }),
        effortCheck: {
          requested: 'high',
          provenance: 'native',
          supported: ['low'],
          inList: false,
          expected: 'not-in-native-list',
        },
      }));
      expect(reason).toContain(
        '; effort high not in grok native list; spawn sends no effort at this step',
      );
    },
  );

  it.each([true, null])('omits the native-list clause when inList is %p', (inList) => {
    const baseline = chosen();
    expect(compileChosenReason({
      ...baseline,
      parts: { ...scoreParts, sampleCount: 7 },
      effortCheck: {
        requested: 'high',
        provenance: inList ? 'native' : 'unknown',
        supported: inList ? ['high'] : null,
        inList,
        expected: inList ? 'native-match' : 'fallback-refused',
      },
    })).toBe(compileChosenReason(baseline));
  });

  it('states user provenance and omits the dataset URL and asOf', () => {
    const reason = compileChosenReason(chosen({ cell: userCell() }));
    expect(reason).toContain('score 70');
    expect(reason).toContain('provenance user');
    expect(reason).not.toContain('provenance seed');
    expect(reason).not.toContain('provenance local');
    expect(reason).not.toContain('asOf');
    expect(reason).not.toContain('2026-04-02');
    expect(reason).not.toContain(USER_URL);
  });

  it('states local provenance with the sample count and omits asOf and sourceRef', () => {
    const reason = compileChosenReason(chosen({ cell: localCell(1) }));
    expect(reason).toContain('provenance local, sample count 1');
    expect(reason).toContain('score 65');
    expect(reason).not.toContain('asOf');
    expect(reason).not.toContain('2026-10-01');
    expect(reason).not.toContain(LOCAL_URL);
    expect(reason).not.toContain('provenance seed');
  });

  it('states no profile when the matrix cell is unknown', () => {
    const reason = compileChosenReason(
      chosen({ cell: { kind: 'unknown' }, score: 50 }),
    );
    expect(reason).toContain('score 50');
    expect(reason).toContain('no profile');
    expect(reason).not.toContain('provenance seed');
    expect(reason).not.toContain('provenance user');
    expect(reason).not.toContain('provenance local');
  });

  it('names a subagent executor and its limit state', () => {
    const reason = compileChosenReason(
      chosen({
        executor: {
          kind: 'subagent',
          id: 'subagent:backend-developer',
          role: 'backend-developer',
          family: 'claude',
        },
        inputRowIds: ['subagent:backend-developer'],
        limitState: 'unknown',
        model: 'sonnet',
      }),
    );
    expect(reason).toContain('executor subagent subagent:backend-developer');
    expect(reason).toContain('model sonnet');
    expect(reason).toContain('limit state unknown');
  });

  it('states when rotation changed the choice', () => {
    const reason = compileChosenReason(chosen({ rotationChangedChoice: true }));
    expect(reason).toContain('rotation changed the choice');
    expect(reason).not.toContain('rotation did not change the choice');
  });

  it('states when rotation did not change the choice', () => {
    const reason = compileChosenReason(
      chosen({ rotationChangedChoice: false }),
    );
    expect(reason).toContain('rotation did not change the choice');
  });

  it('states when a preference changed the choice and echoes its source', () => {
    const reason = compileChosenReason(
      chosen({
        preferenceChangedChoice: true,
        preferenceSource: '  user-note  ',
      }),
    );
    expect(reason).toContain(
      'preference changed the choice, preference source user-note',
    );
    expect(reason).not.toContain('  user-note');
  });

  it('states when a preference did not change the choice', () => {
    const reason = compileChosenReason(
      chosen({ preferenceChangedChoice: false, preferenceSource: '   ' }),
    );
    expect(reason).toContain('preference did not change the choice');
    expect(reason).not.toContain('preference source');
  });

  it('states the model probability for a model-sourced choice', () => {
    expectChosenFacts(chosen({ source: 'model', reportedConfidence: 0.75 }));
  });

  it('states no confidence reported when a model reports none', () => {
    expect(NO_CONFIDENCE_REPORTED).toBe('no confidence reported');
    expectChosenFacts(chosen({ source: 'model', reportedConfidence: null }));
  });

  it.each(['ranking', 'pin'] as const)(
    'does not treat a %s choice as no confidence reported',
    (source) => {
      expectChosenFacts(chosen({ source, reportedConfidence: 0.75 }));
    },
  );

  it.each(FALLBACK_CAUSES)('states fallback cause %s', (cause) => {
    expectChosenFacts(chosen({ source: 'ranking', fallbackCause: cause }));
  });

  it('states fallback cause none when there is no fallback', () => {
    expectChosenFacts(chosen({ fallbackCause: null }));
  });

  it.each(LIMIT_STATES)('states limit state %s', (limitState) => {
    expectChosenFacts(chosen({ limitState }));
  });

  it('returns the same chosen reason for the same facts', () => {
    const input = chosen({
      source: 'model',
      reportedConfidence: 0.6,
      rotationChangedChoice: true,
      cell: seedCell(true),
    });
    expect(compileChosenReason(input)).toBe(compileChosenReason(input));
  });

  it('accepts a chosen reason on the published chosen-entry schema', () => {
    const input = chosen({
      source: 'model',
      reportedConfidence: 0.6,
      cell: seedCell(true),
      fallbackCause: 'timeout',
    });
    const compiled = compileChosenReason(input);
    const reason = withPolicyReason(
      compiled,
      { policy: { ruleId: 'R2', tier: 'sonnet', effort: 'high' }, shape: 'logic', weight: 3 },
    );
    const parsed = ChosenEntrySchema.safeParse({
      phaseId: input.phaseId,
      status: 'chosen',
      executor: {
        kind: input.executor.kind,
        id: input.executor.id,
        cli: 'grok',
        family: 'grok',
      },
      model: input.model,
      tier: 'sonnet',
      effort: 'high',
      provenance: 'reported',
      score: input.score,
      source: input.source,
      taskKind: 'implement',
      confidence: input.reportedConfidence,
      fallbackCause: input.fallbackCause,
      modelProposal: null,
      reason,
    });
    expect(parsed.success).toBe(true);
    expect(reason).toContain(compiled);
    expect(reason).toContain('executor lane grok');
    expect(reason).toContain('fallback cause timeout');
    expect(reason).toMatch(/; policy R2; tier sonnet, effort high, shape logic, weight 3$/);
  });
});

describe('requirement 13.2 unavailable facts', () => {
  it('states no-eligible-candidate when nobody was excluded', () => {
    const reason = compileUnavailableReason({
      phaseId: 'implement',
      exclusionReason: 'no-eligible-candidate',
      excludedBy: [],
      pinRule: null,
      needsDisclosedFallback: false,
      source: 'ranking',
      inputRowIds: [],
    });
    expect(reason).toBe(
      [
        'phase implement',
        'exclusion reason no-eligible-candidate',
        'pin rule none',
        'disclosed fallback false',
        'no candidate excluded',
      ].join('; '),
    );
    expect(namedCandidates(reason)).toEqual([]);
    expect(reason).not.toContain(NO_CONFIDENCE_REPORTED);
  });

  it('states reviewer-family and the disclosed fallback flag', () => {
    const reason = compileUnavailableReason({
      phaseId: 'review',
      exclusionReason: 'reviewer-family',
      excludedBy: [{ candidate: 'codex', rule: 'reviewer-family' }],
      pinRule: null,
      needsDisclosedFallback: true,
      source: 'ranking',
      inputRowIds: ['codex'],
    });
    expect(reason).toBe(
      [
        'phase review',
        'exclusion reason reviewer-family',
        'pin rule none',
        'disclosed fallback true',
        'candidate codex excluded by reviewer-family',
      ].join('; '),
    );
    expect(reason).not.toContain(NO_CONFIDENCE_REPORTED);
  });

  it('states pin-unavailable and the pin rule', () => {
    const reason = compileUnavailableReason({
      phaseId: 'implement',
      exclusionReason: 'pin-unavailable',
      excludedBy: [{ candidate: 'ghost-lane', rule: 'not-listed' }],
      pinRule: 'not-listed',
      needsDisclosedFallback: false,
      source: 'pin',
      inputRowIds: ['grok'],
    });
    expect(reason).toBe(
      [
        'phase implement',
        'exclusion reason pin-unavailable',
        'pin rule not-listed',
        'disclosed fallback false',
        'candidate ghost-lane excluded by not-listed',
      ].join('; '),
    );
  });

  it.each(EXCLUSION_RULES)(
    'states exclusion rule %s on the unavailable entry and the top-level reasons',
    (rule) => {
      const exclusionReason =
        rule === 'not-listed'
          ? 'pin-unavailable'
          : rule === 'reviewer-family'
            ? 'reviewer-family'
            : 'no-eligible-candidate';
      const candidate = rule === 'not-listed' ? 'ghost-lane' : 'codex';
      const reason = compileUnavailableReason({
        phaseId: 'review',
        exclusionReason,
        excludedBy: [{ candidate, rule }],
        pinRule: exclusionReason === 'pin-unavailable' ? rule : null,
        needsDisclosedFallback: exclusionReason === 'reviewer-family',
        source: exclusionReason === 'pin-unavailable' ? 'pin' : 'ranking',
        inputRowIds: ['grok', 'codex'],
      });
      expect(reason).toContain(`exclusion reason ${exclusionReason}`);
      expect(reason).toContain(`candidate ${candidate} excluded by ${rule}`);
      const top = compileResultReasons({
        excluded: [{ phaseId: 'review', candidate, rule }],
        missingInputs: [],
        inputRowIds: ['grok', 'codex'],
      });
      expect(top).toEqual([
        `phase review candidate ${candidate} excluded by ${rule}`,
      ]);
      const names = [
        ...namedCandidates(reason),
        ...top.flatMap((line) => {
          const id = namedTopLevel(line);
          return id === null ? [] : [id];
        }),
      ];
      for (const id of names) {
        if (rule === 'not-listed') {
          expect(id).toBe('ghost-lane');
        } else {
          expect(['grok', 'codex']).toContain(id);
        }
      }
    },
  );

  it('accepts an unavailable reason on the published unavailable-entry schema', () => {
    const input: UnavailableReasonInput = {
      phaseId: 'review',
      exclusionReason: 'reviewer-family',
      excludedBy: [{ candidate: 'codex', rule: 'reviewer-family' }],
      pinRule: null,
      needsDisclosedFallback: true,
      source: 'ranking',
      inputRowIds: ['codex'],
    };
    const compiled = compileUnavailableReason(input);
    const reason = withPolicyReason(
      compiled,
      { policy: { ruleId: 'R5', tier: 'haiku', effort: 'low' } },
    );
    const parsed = UnavailableEntrySchema.safeParse({
      phaseId: input.phaseId,
      status: 'unavailable',
      executor: 'unavailable',
      exclusionReason: input.exclusionReason,
      excludedBy: input.excludedBy,
      pinRule: input.pinRule,
      needsDisclosedFallback: input.needsDisclosedFallback,
      source: input.source,
      model: null,
      tier: 'haiku',
      effort: 'low',
      provenance: null,
      score: null,
      confidence: null,
      fallbackCause: null,
      reason,
    });
    expect(parsed.success).toBe(true);
    expect(reason).toContain(compiled);
    expect(reason).toContain('reviewer-family');
    expect(reason).toMatch(/; policy R5; tier haiku, effort low, shape unset, weight unset$/);
  });
});

describe('requirement 13.3', () => {
  it('lists each excluded candidate once, then the pin rule, then each missing input', () => {
    const gate = compileGateReasons({
      chosen: [
        chosen({
          source: 'model',
          reportedConfidence: null,
          rotationChangedChoice: true,
          preferenceChangedChoice: true,
          preferenceSource: 'user-note',
          limitState: 'unknown',
        }),
      ],
      unavailable: [
        {
          phaseId: 'review',
          exclusionReason: 'pin-unavailable',
          excludedBy: [{ candidate: 'ghost-lane', rule: 'not-listed' }],
          pinRule: 'not-listed',
          needsDisclosedFallback: false,
          source: 'pin',
        },
      ],
      excluded: [
        { phaseId: 'implement', candidate: 'codex', rule: 'at-limit' },
        { phaseId: 'review', candidate: 'ghost-lane', rule: 'not-listed' },
      ],
      missingInputs: ['outcome-history', 'outcome-history', 'matrix-file'],
      inputRowIds: ['grok', 'codex'],
    });
    expect(gate.reasons).toEqual([
      'phase implement candidate codex excluded by at-limit',
      'phase review candidate ghost-lane excluded by not-listed',
      'phase review pin unavailable, pin rule not-listed',
      'no outcome history',
      'matrix file unreadable',
    ]);
    expect(gate.chosenReasons).toHaveLength(1);
    expect(gate.chosenReasons[0]).toContain(NO_CONFIDENCE_REPORTED);
    expect(gate.unavailableReasons).toHaveLength(1);
    expect(gate.unavailableReasons[0]).toContain(
      'exclusion reason pin-unavailable',
    );
    expect(
      compileGateReasons({
        chosen: [
          chosen({
            source: 'model',
            reportedConfidence: null,
            rotationChangedChoice: true,
            preferenceChangedChoice: true,
            preferenceSource: 'user-note',
            limitState: 'unknown',
          }),
        ],
        unavailable: [
          {
            phaseId: 'review',
            exclusionReason: 'pin-unavailable',
            excludedBy: [{ candidate: 'ghost-lane', rule: 'not-listed' }],
            pinRule: 'not-listed',
            needsDisclosedFallback: false,
            source: 'pin',
          },
        ],
        excluded: [
          { phaseId: 'implement', candidate: 'codex', rule: 'at-limit' },
          { phaseId: 'review', candidate: 'ghost-lane', rule: 'not-listed' },
        ],
        missingInputs: ['outcome-history', 'outcome-history', 'matrix-file'],
        inputRowIds: ['grok', 'codex'],
      }),
    ).toEqual(gate);
  });

  it.each(MISSING_INPUTS)('names missing input %s', (input) => {
    expect(
      compileResultReasons({
        excluded: [],
        missingInputs: [input],
        inputRowIds: [],
      }),
    ).toEqual([MISSING_INPUT_REASON[input]]);
  });

  it('names each missing input on a pre-flight result', () => {
    const reasons = compilePreflightReasons({
      answers: [
        {
          name: 'taskType',
          source: 'model',
          reportedConfidence: 0.8,
          fallbackCause: null,
        },
        {
          name: 'depth',
          source: 'skill-table',
          reportedConfidence: 0.33,
          fallbackCause: 'timeout',
        },
      ],
      missingInputs: ['roles', 'roles'],
    });
    expect(reasons).toEqual([
      'taskType source model; model probability 0.8; fallback cause none',
      'depth source skill-table; confidence not applicable; fallback cause timeout',
      'roles unavailable',
    ]);
    expect(reasons.join('\n')).not.toContain('0.33');
  });

  it('accepts pre-flight reasons on the published pre-flight schema', () => {
    const reasons = compilePreflightReasons({
      answers: [
        {
          name: 'taskType',
          source: 'skill-table',
          reportedConfidence: null,
          fallbackCause: null,
        },
        {
          name: 'depth',
          source: 'skill-table',
          reportedConfidence: null,
          fallbackCause: null,
        },
      ],
      missingInputs: ['outcome-history'],
    });
    const parsed = PreflightResultSchema.safeParse({
      stage: 'pre-flight',
      taskType: {
        value: null,
        source: 'skill-table',
        confidence: null,
        fallbackCause: null,
        modelProposal: null,
      },
      depth: {
        value: null,
        source: 'skill-table',
        confidence: null,
        fallbackCause: null,
        modelProposal: null,
      },
      overallConfidence: null,
      reasons,
      usage,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('requirement 13.4', () => {
  it('keeps reason facts aligned for every source, cause and exclusion reason', () => {
    for (const source of ['model', 'ranking', 'pin'] as const) {
      for (const cause of FALLBACK_CAUSES) {
        expectChosenFacts(
          chosen({
            source,
            fallbackCause: cause,
            reportedConfidence: 0.75,
            discardedModelText: MODEL_TEXT,
            modelProposalOption: PROPOSAL,
          }),
        );
      }
      expectChosenFacts(
        chosen({
          source,
          fallbackCause: null,
          reportedConfidence: null,
          cell: seedCell(true),
        }),
      );
    }
    const exclusionCases = [
      {
        exclusionReason: 'no-eligible-candidate' as const,
        rule: 'at-limit' as const,
        candidate: 'codex',
      },
      {
        exclusionReason: 'reviewer-family' as const,
        rule: 'reviewer-family' as const,
        candidate: 'codex',
      },
      {
        exclusionReason: 'pin-unavailable' as const,
        rule: 'not-listed' as const,
        candidate: 'ghost-lane',
      },
    ];
    for (const entry of exclusionCases) {
      const reason = compileUnavailableReason({
        phaseId: 'review',
        exclusionReason: entry.exclusionReason,
        excludedBy: [{ candidate: entry.candidate, rule: entry.rule }],
        pinRule:
          entry.exclusionReason === 'pin-unavailable' ? entry.rule : null,
        needsDisclosedFallback: entry.exclusionReason === 'reviewer-family',
        source: entry.exclusionReason === 'pin-unavailable' ? 'pin' : 'ranking',
        inputRowIds: ['grok', 'codex'],
        discardedModelText: MODEL_TEXT,
      });
      expect(reason).toContain(`exclusion reason ${entry.exclusionReason}`);
      expect(reason).toContain(
        `candidate ${entry.candidate} excluded by ${entry.rule}`,
      );
      expect(reason).not.toContain(MODEL_TEXT);
      for (const id of namedCandidates(reason)) {
        if (entry.rule === 'not-listed') {
          expect(id).toBe(entry.candidate);
        } else {
          expect(['grok', 'codex']).toContain(id);
        }
      }
    }
  });

  it('does not name a candidate that was not supplied', () => {
    const gate = compileGateReasons({
      chosen: [chosen()],
      unavailable: [
        {
          phaseId: 'review',
          exclusionReason: 'no-eligible-candidate',
          excludedBy: [{ candidate: 'codex', rule: 'disabled' }],
          pinRule: null,
          needsDisclosedFallback: false,
          source: 'ranking',
        },
      ],
      excluded: [{ phaseId: 'implement', candidate: 'grok', rule: 'pruned' }],
      missingInputs: [],
      inputRowIds: ['grok', 'codex'],
    });
    const text = [
      ...gate.chosenReasons,
      ...gate.unavailableReasons,
      ...gate.reasons,
    ].join('\n');
    expect(text).not.toContain('invented-lane');
    expect(text).not.toContain('ghost-lane');
    const named = [
      ...gate.chosenReasons.flatMap((reason) => namedCandidates(reason)),
      ...gate.unavailableReasons.flatMap((reason) => namedCandidates(reason)),
      ...gate.reasons.flatMap((line) => {
        const id = namedTopLevel(line);
        return id === null ? [] : [id];
      }),
    ];
    for (const id of named) {
      expect(['grok', 'codex']).toContain(id);
    }
  });

  it('refuses an excluded candidate that is not an input row', () => {
    expect(() =>
      compileResultReasons({
        excluded: [
          {
            phaseId: 'implement',
            candidate: 'invented-lane',
            rule: 'at-limit',
          },
        ],
        missingInputs: [],
        inputRowIds: ['grok'],
      }),
    ).toThrow('excluded candidate invented-lane is not an input row');
  });

  it('allows a not-listed pin that is absent from the rows', () => {
    expect(
      compileResultReasons({
        excluded: [
          { phaseId: 'implement', candidate: 'ghost-lane', rule: 'not-listed' },
        ],
        missingInputs: [],
        inputRowIds: ['grok'],
      }),
    ).toEqual(['phase implement candidate ghost-lane excluded by not-listed']);
  });

  it('refuses a chosen executor that is not an input row', () => {
    expect(() =>
      compileChosenReason(
        chosen({
          executor: lane('invented-lane'),
          inputRowIds: ['grok'],
        }),
      ),
    ).toThrow('chosen executor invented-lane is not an input row');
  });

  it('refuses a chosen score that disagrees with the matrix cell', () => {
    expect(() =>
      compileChosenReason(chosen({ cell: seedCell(true), score: 50 })),
    ).toThrow('chosen score must equal the matrix cell score');
  });

  it('refuses a score outside the routing scale', () => {
    expect(() => compileChosenReason(chosen({ score: 101 }))).toThrow(
      'score must be an integer',
    );
    expect(() => compileChosenReason(chosen({ score: -1 }))).toThrow(
      'score must be an integer',
    );
    expect(() => compileChosenReason(chosen({ score: 50.5 }))).toThrow(
      'score must be an integer',
    );
  });

  it('refuses a local cell without a sample count', () => {
    expect(() => compileChosenReason(chosen({ cell: localCell() }))).toThrow(
      'a local matrix cell must carry sampleCount',
    );
  });

  it('refuses a local sample count below the minimum', () => {
    expect(() =>
      compileChosenReason(chosen({ cell: localCell(0) })),
    ).toThrow('at least 1');
  });

  it('refuses a value that would break a clause', () => {
    expect(() =>
      compileChosenReason(
        chosen({ model: 'grok; candidate ghost excluded by at-limit' }),
      ),
    ).toThrow('semicolon');
    expect(() =>
      compileChosenReason(
        chosen({
          preferenceSource: 'user; candidate ghost excluded by at-limit',
        }),
      ),
    ).toThrow('semicolon');
  });

  it('refuses a pin-unavailable entry without a pin rule', () => {
    expect(() =>
      compileUnavailableReason({
        phaseId: 'implement',
        exclusionReason: 'pin-unavailable',
        excludedBy: [],
        pinRule: null,
        needsDisclosedFallback: false,
        source: 'pin',
        inputRowIds: [],
      }),
    ).toThrow('pin-unavailable requires a pin rule');
  });

  it('refuses a pin rule on a non-pin exclusion', () => {
    expect(() =>
      compileUnavailableReason({
        phaseId: 'implement',
        exclusionReason: 'no-eligible-candidate',
        excludedBy: [],
        pinRule: 'at-limit',
        needsDisclosedFallback: false,
        source: 'ranking',
        inputRowIds: [],
      }),
    ).toThrow('pin rule is set only for pin-unavailable');
  });

  it('refuses a reviewer-family entry without the disclosed-fallback flag', () => {
    expect(() =>
      compileUnavailableReason({
        phaseId: 'review',
        exclusionReason: 'reviewer-family',
        excludedBy: [{ candidate: 'codex', rule: 'reviewer-family' }],
        pinRule: null,
        needsDisclosedFallback: false,
        source: 'ranking',
        inputRowIds: ['codex'],
      }),
    ).toThrow(
      'disclosed fallback is set only for exclusion reason reviewer-family',
    );
  });

  it('refuses a disclosed-fallback flag on a non-reviewer exclusion', () => {
    expect(() =>
      compileUnavailableReason({
        phaseId: 'implement',
        exclusionReason: 'no-eligible-candidate',
        excludedBy: [],
        pinRule: null,
        needsDisclosedFallback: true,
        source: 'ranking',
        inputRowIds: [],
      }),
    ).toThrow(
      'disclosed fallback is set only for exclusion reason reviewer-family',
    );
  });
});

describe('B08 one-sentence explanations and per-lane reason deduplication', () => {
  it('formats limit age cleanly and renders age unknown when timestamp is absent', () => {
    expect(formatLimitAge(null, 10_000)).toBe('age unknown');
    expect(formatLimitAge(undefined, 10_000)).toBe('age unknown');
    expect(formatLimitAge(9_500, 10_000)).toBe('age 500ms');
    expect(formatLimitAge(10_000 - 45_000, 10_000)).toBe('age 45s');
    expect(formatLimitAge(10_000 - 180_000, 10_000)).toBe('age 3m');
    expect(formatLimitAge(10_000 - 7_200_000, 10_000)).toBe('age 2h');
  });

  it('renders a chosen one-sentence explanation with parts, signed gap, deciding factor, preference diagnostics, policy rule note, and limit age', () => {
    const explanation = compileChosenExplanation({
      candidateId: 'kimi-cli',
      displayName: 'Kimi Code',
      model: 'kimi-k2',
      total: 87,
      parts: {
        prior: 70,
        priorSource: 'seed',
        learned: 5,
        exploration: 5,
        sampleCount: 0,
        preference: 12,
        limit: 0,
      },
      strongestAlternative: {
        id: 'codex',
        displayName: 'codex',
        total: 85,
        parts: {
          prior: 80,
          priorSource: 'seed',
          learned: 5,
          exploration: 5,
          sampleCount: 0,
          preference: 0,
          limit: 0,
        },
      },
      decidingFactor: 'rule ui-review',
      preferenceSource: 'rule',
      overriddenPreferenceSources: ['call', 'configured'],
      preferenceMatches: [
        {
          entry: 'Kimi Code',
          rank: 1,
          ids: ['kimi-cli'],
          via: 'displayName',
          status: 'matched',
        },
      ],
      policyCondition: 'R3 shape=logic weight>=8000',
      tier: 'sonnet',
      effort: 'xhigh',
      matchedRuleId: 'ui-review',
      policyRuleNote: 'rule ui-review capped tier opus->sonnet',
      limitState: 'confirmed-room',
      limitEvidence: {
        state: 'confirmed-room',
        lookup: 'ok',
        status: 'available',
        readAt: 1_000_000 - 30_000,
      },
      nowMs: 1_000_000,
    });

    expect(explanation).not.toContain('\n');
    expect(explanation.endsWith('.')).toBe(true);
    expect(explanation).toContain(
      'Selected Kimi Code (kimi-cli) (model kimi-k2) with total 87 [prior 70 (seed), learned +5 (exploration +5, n=0), preference +12, limit +0]',
    );
    expect(explanation).toContain('over runner-up codex at total 85');
    expect(explanation).toContain('(gap +2)');
    expect(explanation).toContain('decided by rule ui-review');
    expect(explanation).toContain('preferences from rule (overridden: call, configured, Kimi Code->kimi-cli via displayName (#1))');
    expect(explanation).toContain(
      'policy R3 shape=logic weight>=8000, sonnet/xhigh after rule ui-review capped tier opus->sonnet',
    );
    expect(explanation).toContain('limit confirmed-room (age 30s)');
  });

  it('renders an unavailable one-sentence explanation naming the blocking constraint', () => {
    const explanation = compileUnavailableExplanation({
      phaseId: 'review',
      exclusionReason: 'reviewer-family',
      pinRule: null,
      needsDisclosedFallback: true,
      excludedBy: [{ candidate: 'codex', rule: 'reviewer-family' }],
      policyCondition: 'R2 kind=review weight omitted',
      tier: 'opus',
      effort: 'high',
    });
    expect(explanation).toBe(
      'Phase review is unavailable due to blocking constraint reviewer-family (disclosed fallback required, excluded: codex by reviewer-family), policy R2 kind=review weight omitted, opus/high.',
    );
  });

  it('removes generic models unknown when per-lane model status is supplied and deduplicates extraReasons', () => {
    const gate = compileGateReasons({
      chosen: [chosen()],
      unavailable: [],
      excluded: [],
      missingInputs: ['limits', 'model-lists'],
      inputRowIds: ['grok', 'codex'],
      extraReasons: [
        'models unknown for codex (timeout)',
        'models unknown for codex (timeout)',
        'routing rule bad: ignored',
        'routing rule bad: ignored',
      ],
    });
    expect(gate.reasons).toEqual([
      'limits unavailable',
      'models unknown for codex (timeout)',
      'routing rule bad: ignored',
    ]);
  });

  it.each([10, 100])('fits exactly 4000 characters when omitted diagnostics grow to %i', (omitted) => {
    const marker = `and ${omitted} more diagnostic entries omitted`;
    const prefix = [
      ...Array.from({ length: 16 }, (_, index) => String(index).padEnd(240, 'x')),
      'last'.padEnd(4000 - marker.length - 16 * 240, 'x'),
    ];
    const tail = ['xx', ...Array.from({ length: omitted - 1 }, (_, index) =>
      `tail ${index}`.padEnd(240, 'x'),
    )];
    const result = compileGateReasons({
      chosen: [], unavailable: [], excluded: [], missingInputs: [], inputRowIds: [],
      extraReasons: [...prefix, ...tail],
    });

    expect(result.reasons).toEqual([...prefix, marker]);
    expect(result.reasons.join('')).toHaveLength(4000);
  });

  it('uses the full diagnostic budget when every entry fits without an omission marker', () => {
    const extraReasons = [
      ...Array.from({ length: 16 }, (_, index) => String(index).padEnd(240, 'x')),
      'last'.padEnd(159, 'x'),
      'x',
    ];
    const result = compileGateReasons({
      chosen: [], unavailable: [], excluded: [], missingInputs: [], inputRowIds: [],
      extraReasons,
    });

    expect(result.reasons).toEqual(extraReasons);
    expect(result.reasons.join('')).toHaveLength(4000);
  });

  it('bounds selector snippets, ambiguous samples, preference diagnostics, and aggregate extraReasons characters', () => {
    const longSelector = 'unknown-selector-'.repeat(12);
    const explanation = compileChosenExplanation({
      candidateId: 'codex',
      displayName: 'codex',
      model: 'gpt-5',
      total: 85,
      decidingFactor: 'call preference',
      preferenceSource: 'call',
      preferenceMatches: [
        { entry: longSelector, rank: 1, ids: [], status: 'unknown' },
        { entry: longSelector, rank: 2, ids: [], status: 'unknown' },
        {
          entry: 'shared-family',
          rank: 3,
          ids: ['a', 'b', 'c', 'd', 'e', 'f'],
          via: 'family',
          status: 'ambiguous',
        },
        ...Array.from({ length: 10 }, (_, idx) => ({
          entry: `missing-${idx}`,
          rank: idx + 4,
          ids: [],
          status: 'unknown' as const,
        })),
      ],
      policyCondition: 'R5 shape=unset weight omitted',
      tier: 'sonnet',
      effort: 'medium',
      limitState: 'confirmed-room',
    });
    expect(explanation).toContain('decided by call preference');
    expect(explanation).toContain(`${longSelector.slice(0, 45)}...: unknown`);
    expect(explanation).not.toContain(longSelector);
    expect(explanation).toContain('shared-family: ambiguous (a/b/c and 3 more)');
    expect(explanation).toContain('and 4 more');

    const manyExtras = Array.from(
      { length: 200 },
      (_, idx) => `routing rule r-${idx}: exclude selector "${'z'.repeat(180)}" matched no candidate`,
    );
    const gate = compileGateReasons({
      chosen: [chosen()],
      unavailable: [],
      excluded: [],
      missingInputs: ['model-lists'],
      inputRowIds: ['grok', 'codex'],
      extraReasons: ['models unknown for codex (timeout)', ...manyExtras],
    });
    expect(gate.reasons).toContain('models unknown for codex (timeout)');
    expect(gate.reasons).not.toContain('models unknown');
    const last = gate.reasons[gate.reasons.length - 1];
    expect(last).toMatch(/^and \d+ more diagnostic entries omitted$/);
    const aggregateChars = gate.reasons.reduce((sum, line) => sum + line.length, 0);
    expect(aggregateChars).toBeLessThanOrEqual(4000);
  });

  it('reports pin or rotation on preference loss regardless of negative deficit', () => {
    const base = {
      candidateId: 'grok',
      displayName: 'grok',
      model: 'grok-4',
      total: 90,
      preferenceSource: 'call' as const,
      preferenceLoss: {
        candidateDisplayName: 'codex',
        candidateTotal: 77,
        boost: 12,
      },
      policyCondition: 'R5 shape=unset weight omitted',
      tier: 'sonnet' as const,
      effort: 'medium' as const,
      limitState: 'confirmed-room' as const,
    };

    const pinExplanation = compileChosenExplanation({
      ...base,
      decidingFactor: 'pin',
    });
    expect(pinExplanation).toContain('boost +12 on codex total 77 lost under pin');
    expect(pinExplanation).not.toContain('lost to total 90');

    const rotExplanation = compileChosenExplanation({
      ...base,
      decidingFactor: 'rotation',
    });
    expect(rotExplanation).toContain('boost +12 on codex total 77 lost under rotation');
    expect(rotExplanation).not.toContain('lost to total 90');

    const scoreExplanation = compileChosenExplanation({
      ...base,
      decidingFactor: 'score',
    });
    expect(scoreExplanation).toContain('boost +12 on codex total 77 lost to total 90 (gap -13)');
  });

  it('deduplicates by original identity across phases and counts display collisions from truncated selectors in the omission marker', () => {
    const sharedPrefix = 'a'.repeat(45);
    const distinct32 = Array.from(
      { length: 32 },
      (_, idx) =>
        `routing rule same-prefix: exclude selector "${sharedPrefix}-suffix-${idx}" matched no candidate`,
    );
    // Simulate two phases matching the same rule (32 distinct identities repeated twice).
    const gate = compileGateReasons({
      chosen: [chosen()],
      unavailable: [],
      excluded: [],
      missingInputs: [],
      inputRowIds: ['grok', 'codex'],
      extraReasons: [...distinct32, ...distinct32],
    });

    expect(gate.reasons).toEqual([
      `routing rule same-prefix: exclude selector "${sharedPrefix}..." matched no candidate`,
      'and 31 more diagnostic entries omitted',
    ]);

    // Also verify mixed display collisions + character cap keep total chars <= 4000 and exact total count.
    const manyRules = Array.from({ length: 60 }, (_, idx) => ({
      identity: `id-rule-${idx}`,
      display: `routing rule cap-${idx}: exclude selector "${'b'.repeat(60)}" matched no candidate`,
    }));
    const collidingExplicit = Array.from({ length: 5 }, (_, idx) => ({
      identity: `explicit-collision-${idx}`,
      display: 'routing rule shared-explicit: repeated bounded display',
    }));
    const combined = compileGateReasons({
      chosen: [chosen()],
      unavailable: [],
      excluded: [],
      missingInputs: [],
      inputRowIds: ['grok', 'codex'],
      extraReasons: [...collidingExplicit, ...manyRules],
    });
    const omittedLine = combined.reasons[combined.reasons.length - 1];
    const match = /^and (\d+) more diagnostic entries omitted$/.exec(omittedLine);
    expect(match).not.toBeNull();
    const emittedCount = combined.reasons.length - 1;
    const omittedCount = Number(match?.[1]);
    expect(emittedCount + omittedCount).toBe(65);
    const totalChars = combined.reasons.reduce((sum, line) => sum + line.length, 0);
    expect(totalChars).toBeLessThanOrEqual(4000);
  });
});
