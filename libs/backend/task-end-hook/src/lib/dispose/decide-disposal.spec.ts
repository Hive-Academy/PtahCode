import {
  TASK_END_DISPOSE_BLOCK_REASONS,
  type TaskEndDisposeBlockReason,
  type TaskEndDisposeOutcome,
} from '@ptah-extension/shared';
import { decideDisposal } from './decide-disposal';
import {
  DISPOSAL_ARCHIVE_ALLOW_LIST,
  type DisposalInputRecord,
} from './disposal-input';

const MAIN = '/repo/main';
const AGENT_DIR = `${MAIN}/.claude-worktrees`;
const WT = `${AGENT_DIR}/task-886`;

/** Every precondition P2 to P11 holds. */
function eligible(): DisposalInputRecord {
  return {
    worktreePath: WT,
    requestedMode: 'off',
    autoReachable: false,
    cancelledPolicy: 'never',
    carrier: { kind: 'ok', status: 'done' },
    links: {
      kind: 'ok',
      bySession: true,
      byName: false,
      byContextLine: false,
      otherNonTerminalTaskIds: [],
    },
    worktreeEntry: {
      kind: 'listed',
      entry: {
        path: WT,
        branch: 'feat/task-886',
        head: 'abcdef12',
        isMain: false,
        isBare: false,
      },
    },
    dirExists: true,
    pathResolution: { kind: 'resolved', realPath: WT },
    mainRealPath: MAIN,
    agentDirRealPath: AGENT_DIR,
    porcelain: { kind: 'ok', trackedChanges: 0, untrackedNonIgnored: 0 },
    ignoredFiles: {
      kind: 'ok',
      files: [
        { relPath: 'node_modules/pkg/index.js', bytes: 5_000_000 },
        { relPath: 'screenshots/a.png', bytes: 600 },
        { relPath: 'notes.local.md', bytes: 400 },
      ],
    },
    allowList: DISPOSAL_ARCHIVE_ALLOW_LIST,
    archiveMaxBytes: 1_000,
    archiveMaxFiles: 2,
    archiveDestination: { kind: 'absent' },
    merge: { kind: 'ancestor' },
    openPr: { kind: 'none' },
    activity: { kind: 'ok', lanes: [], sessions: [MAIN], workspaces: [MAIN] },
    harvestOutcome: 'harvested',
    probeErrors: [],
  };
}

function withRecord(patch: Partial<DisposalInputRecord>): DisposalInputRecord {
  return { ...eligible(), ...patch };
}

function listedEntry(
  extra: Partial<{
    isMain: boolean;
    isBare: boolean;
    locked: boolean;
    prunable: boolean;
  }>,
): DisposalInputRecord['worktreeEntry'] {
  return {
    kind: 'listed',
    entry: {
      path: WT,
      branch: 'feat/task-886',
      head: 'abcdef12',
      isMain: false,
      isBare: false,
      ...extra,
    },
  };
}

const MISSING_WT: Partial<DisposalInputRecord> = {
  dirExists: false,
  worktreeEntry: listedEntry({ prunable: true }),
  porcelain: { kind: 'error' },
  ignoredFiles: { kind: 'error' },
  archiveDestination: { kind: 'error' },
};

function reasonOf(outcome: TaskEndDisposeOutcome): string {
  return `${outcome.state}/${outcome.reason}`;
}

describe('decideDisposal', () => {
  it('passes P11 for a manual-only harvest and still blocks a real no-carrier', () => {
    expect(reasonOf(decideDisposal(withRecord({ harvestOutcome: 'manual-only' })))).toBe(
      'skipped/eligible-report-only',
    );
    expect(reasonOf(decideDisposal(withRecord({ harvestOutcome: 'no-carrier' })))).toBe(
      'blocked/harvest-no-carrier',
    );
  });
  it('returns skipped/eligible-report-only when every precondition holds', () => {
    expect(decideDisposal(eligible())).toEqual({
      step: 'dispose',
      state: 'skipped',
      reason: 'eligible-report-only',
      requestedMode: 'off',
      effectiveMode: 'off',
      modeReason: 'none',
      activityScope: 'in-process',
    });
  });

  // One row per failing precondition, in table order (P2 to P11).
  const rows: ReadonlyArray<
    [string, Partial<DisposalInputRecord>, TaskEndDisposeBlockReason]
  > = [
    // P2
    [
      'P2 cancelled',
      { carrier: { kind: 'ok', status: 'cancelled' } },
      'status-not-eligible',
    ],
    [
      'P2 in_progress',
      { carrier: { kind: 'ok', status: 'in_progress' } },
      'status-not-eligible',
    ],
    [
      'P2 in_review',
      { carrier: { kind: 'ok', status: 'in_review' } },
      'status-not-eligible',
    ],
    [
      'P2 unparseable',
      { carrier: { kind: 'unparseable' } },
      'precondition-unverifiable',
    ],
    // P3
    [
      'P3 no link source',
      {
        links: {
          kind: 'ok',
          bySession: false,
          byName: false,
          byContextLine: false,
          otherNonTerminalTaskIds: [],
        },
      },
      'no-linked-worktree',
    ],
    [
      'P3 linked to another task',
      {
        links: {
          kind: 'ok',
          bySession: false,
          byName: true,
          byContextLine: false,
          otherNonTerminalTaskIds: ['TASK_2026_900'],
        },
      },
      'linked-to-other-task',
    ],
    [
      'P3 link probe error',
      { links: { kind: 'error' } },
      'precondition-unverifiable',
    ],
    // P4
    ['P4 not listed', { worktreeEntry: { kind: 'not-listed' } }, 'not-listed'],
    [
      'P4 main worktree',
      { worktreeEntry: listedEntry({ isMain: true }) },
      'is-main-worktree',
    ],
    [
      'P4 bare entry',
      { worktreeEntry: listedEntry({ isBare: true }) },
      'is-main-worktree',
    ],
    [
      'P4 list error',
      { worktreeEntry: { kind: 'error' } },
      'precondition-unverifiable',
    ],
    // P5
    [
      'P5 resolved outside the agent dir',
      { pathResolution: { kind: 'resolved', realPath: '/elsewhere/wt' } },
      'outside-agent-dir',
    ],
    [
      'P5 symlink resolving to a sibling prefix',
      {
        pathResolution: { kind: 'resolved', realPath: `${AGENT_DIR}-evil/wt` },
      },
      'outside-agent-dir',
    ],
    [
      'P5 the agent dir itself',
      { pathResolution: { kind: 'resolved', realPath: AGENT_DIR } },
      'outside-agent-dir',
    ],
    [
      'P5 the main checkout',
      { pathResolution: { kind: 'resolved', realPath: MAIN } },
      'outside-agent-dir',
    ],
    [
      'P5 realpath error',
      { pathResolution: { kind: 'error' } },
      'precondition-unverifiable',
    ],
    [
      'P5 agent dir unresolved',
      { agentDirRealPath: null },
      'precondition-unverifiable',
    ],
    ['P5 main unresolved', { mainRealPath: null }, 'precondition-unverifiable'],
    [
      'P5 resolved but directory reported missing',
      { dirExists: false },
      'precondition-unverifiable',
    ],
    [
      'P5 missing but directory reported present',
      {
        pathResolution: {
          kind: 'missing',
          nearestParentRealPath: AGENT_DIR,
          remainingSegments: ['gone-wt'],
        },
      },
      'precondition-unverifiable',
    ],
    [
      'P5 missing with no remaining segment',
      {
        ...MISSING_WT,
        pathResolution: {
          kind: 'missing',
          nearestParentRealPath: AGENT_DIR,
          remainingSegments: [],
        },
      },
      'outside-agent-dir',
    ],
    [
      'P5 missing with an empty segment',
      {
        ...MISSING_WT,
        pathResolution: {
          kind: 'missing',
          nearestParentRealPath: AGENT_DIR,
          remainingSegments: [''],
        },
      },
      'outside-agent-dir',
    ],
    [
      'P5 missing with a separator in a segment',
      {
        ...MISSING_WT,
        pathResolution: {
          kind: 'missing',
          nearestParentRealPath: AGENT_DIR,
          remainingSegments: ['a/b'],
        },
      },
      'outside-agent-dir',
    ],
    [
      'P5 missing with a backslash in a segment',
      {
        ...MISSING_WT,
        pathResolution: {
          kind: 'missing',
          nearestParentRealPath: AGENT_DIR,
          remainingSegments: ['a\\b'],
        },
      },
      'outside-agent-dir',
    ],
    [
      'P5 missing with a "." segment',
      {
        ...MISSING_WT,
        pathResolution: {
          kind: 'missing',
          nearestParentRealPath: AGENT_DIR,
          remainingSegments: ['.'],
        },
      },
      'outside-agent-dir',
    ],
    // P6
    ['P6 locked', { worktreeEntry: listedEntry({ locked: true }) }, 'locked'],
    // P7
    [
      'P7 tracked change',
      { porcelain: { kind: 'ok', trackedChanges: 1, untrackedNonIgnored: 3 } },
      'dirty-tracked',
    ],
    [
      'P7 untracked file',
      { porcelain: { kind: 'ok', trackedChanges: 0, untrackedNonIgnored: 1 } },
      'untracked-files',
    ],
    [
      'P7 status error',
      { porcelain: { kind: 'error' } },
      'precondition-unverifiable',
    ],
    [
      'P7 invalid count',
      {
        porcelain: {
          kind: 'ok',
          trackedChanges: Number.NaN,
          untrackedNonIgnored: 0,
        },
      },
      'precondition-unverifiable',
    ],
    [
      'P7 archive exists',
      { archiveDestination: { kind: 'exists' } },
      'archive-exists',
    ],
    [
      'P7 archive stat error',
      { archiveDestination: { kind: 'error' } },
      'precondition-unverifiable',
    ],
    [
      'P7 ignored walk truncated',
      { ignoredFiles: { kind: 'truncated' } },
      'archive-too-large',
    ],
    [
      'P7 ignored walk error',
      { ignoredFiles: { kind: 'error' } },
      'precondition-unverifiable',
    ],
    [
      'P7 negative file size',
      {
        ignoredFiles: { kind: 'ok', files: [{ relPath: 'a.bin', bytes: -1 }] },
      },
      'precondition-unverifiable',
    ],
    [
      'P7 invalid byte cap',
      { archiveMaxBytes: Number.NaN },
      'precondition-unverifiable',
    ],
    [
      'P7 invalid file cap',
      { archiveMaxFiles: -1 },
      'precondition-unverifiable',
    ],
    // P8
    ['P8 not merged', { merge: { kind: 'not-ancestor' } }, 'not-merged'],
    ['P8 unverified', { merge: { kind: 'unverified' } }, 'merge-unverified'],
    // P9
    ['P9 open PR', { openPr: { kind: 'open' } }, 'open-pr'],
    ['P9 gh error', { openPr: { kind: 'error' } }, 'precondition-unverifiable'],
    [
      'P9 not queried',
      { openPr: { kind: 'not-queried' } },
      'precondition-unverifiable',
    ],
    // P10
    [
      'P10 lane inside the worktree',
      {
        activity: {
          kind: 'ok',
          lanes: [`${WT}/libs/x`],
          sessions: [],
          workspaces: [],
        },
      },
      'in-use',
    ],
    [
      'P10 live session at the worktree root',
      { activity: { kind: 'ok', lanes: [], sessions: [WT], workspaces: [] } },
      'in-use',
    ],
    [
      'P10 workspace registration',
      {
        activity: {
          kind: 'ok',
          lanes: [],
          sessions: [],
          workspaces: [`${WT}/`],
        },
      },
      'in-use',
    ],
    [
      'P10 activity unavailable',
      { activity: { kind: 'unavailable' } },
      'in-use-unverifiable',
    ],
    // P11
    ['P11 pending', { harvestOutcome: 'pending' }, 'harvest-pending'],
    ['P11 failed', { harvestOutcome: 'harvest-failed' }, 'harvest-failed'],
    ['P11 no carrier', { harvestOutcome: 'no-carrier' }, 'harvest-no-carrier'],
    // Any unattributed probe error never passes.
    [
      'probe error',
      { probeErrors: ['probe-timeout'] },
      'precondition-unverifiable',
    ],
  ];

  it.each(rows)('%s gives blocked/%s', (_name, patch, reason) => {
    expect(decideDisposal(withRecord(patch))).toEqual({
      step: 'dispose',
      state: 'blocked',
      reason,
      requestedMode: 'off',
      effectiveMode: 'off',
      modeReason: 'none',
      activityScope: 'in-process',
    });
  });

  it('covers every dispose block reason with at least one row', () => {
    const covered = new Set(rows.map(([, , reason]) => reason));
    expect(
      [...TASK_END_DISPOSE_BLOCK_REASONS].filter((r) => !covered.has(r)),
    ).toEqual([]);
  });

  it.each(['harvested', 'already-harvested'] as const)(
    'P11 %s passes',
    (harvestOutcome) => {
      expect(reasonOf(decideDisposal(withRecord({ harvestOutcome })))).toBe(
        'skipped/eligible-report-only',
      );
    },
  );

  it.each([
    ['by name', { bySession: false, byName: true, byContextLine: false }],
    [
      'by context line',
      { bySession: false, byName: false, byContextLine: true },
    ],
  ])('P3 a link %s alone passes', (_name, link) => {
    const outcome = decideDisposal(
      withRecord({
        links: { kind: 'ok', ...link, otherNonTerminalTaskIds: [] },
      }),
    );
    expect(reasonOf(outcome)).toBe('skipped/eligible-report-only');
  });

  it('P9 gh unavailable leaves the decision to P8 (C3)', () => {
    expect(
      reasonOf(
        decideDisposal(withRecord({ openPr: { kind: 'gh-unavailable' } })),
      ),
    ).toBe('skipped/eligible-report-only');
  });

  it('P10 a session in the main checkout does not use the worktree', () => {
    expect(
      reasonOf(
        decideDisposal(
          withRecord({
            activity: {
              kind: 'ok',
              lanes: [`${AGENT_DIR}/other-wt`, `${WT}-sibling`],
              sessions: [MAIN],
              workspaces: [MAIN, ''],
            },
          }),
        ),
      ),
    ).toBe('skipped/eligible-report-only');
  });

  it('P10 matches activity against the real path as well as the lexical path', () => {
    const outcome = decideDisposal(
      withRecord({
        worktreePath: '/link/to/wt',
        activity: { kind: 'ok', lanes: [WT], sessions: [], workspaces: [] },
      }),
    );
    expect(reasonOf(outcome)).toBe('blocked/in-use');
  });

  describe('first failure wins, in table order', () => {
    it('P2 before every later row', () => {
      const outcome = decideDisposal(
        withRecord({
          carrier: { kind: 'ok', status: 'cancelled' },
          links: { kind: 'error' },
          worktreeEntry: { kind: 'not-listed' },
          porcelain: { kind: 'ok', trackedChanges: 4, untrackedNonIgnored: 4 },
          merge: { kind: 'not-ancestor' },
          harvestOutcome: 'pending',
        }),
      );
      expect(reasonOf(outcome)).toBe('blocked/status-not-eligible');
    });

    it('P4 before P5 and P6', () => {
      const outcome = decideDisposal(
        withRecord({
          worktreeEntry: listedEntry({ isMain: true, locked: true }),
          pathResolution: { kind: 'resolved', realPath: MAIN },
        }),
      );
      expect(reasonOf(outcome)).toBe('blocked/is-main-worktree');
    });

    it('P5 before P6', () => {
      const outcome = decideDisposal(
        withRecord({
          worktreeEntry: listedEntry({ locked: true }),
          pathResolution: { kind: 'resolved', realPath: '/elsewhere' },
        }),
      );
      expect(reasonOf(outcome)).toBe('blocked/outside-agent-dir');
    });

    it('P7 order: dirty-tracked, untracked-files, archive-exists, archive-too-large', () => {
      const base: Partial<DisposalInputRecord> = {
        archiveDestination: { kind: 'exists' },
        ignoredFiles: { kind: 'truncated' },
      };
      expect(
        reasonOf(
          decideDisposal(
            withRecord({
              ...base,
              porcelain: {
                kind: 'ok',
                trackedChanges: 1,
                untrackedNonIgnored: 1,
              },
            }),
          ),
        ),
      ).toBe('blocked/dirty-tracked');
      expect(
        reasonOf(
          decideDisposal(
            withRecord({
              ...base,
              porcelain: {
                kind: 'ok',
                trackedChanges: 0,
                untrackedNonIgnored: 1,
              },
            }),
          ),
        ),
      ).toBe('blocked/untracked-files');
      expect(reasonOf(decideDisposal(withRecord(base)))).toBe(
        'blocked/archive-exists',
      );
    });

    it('P8 before P9, P9 before P10, P10 before P11', () => {
      expect(
        reasonOf(
          decideDisposal(
            withRecord({
              merge: { kind: 'unverified' },
              openPr: { kind: 'open' },
              activity: { kind: 'unavailable' },
              harvestOutcome: 'harvest-failed',
            }),
          ),
        ),
      ).toBe('blocked/merge-unverified');
      expect(
        reasonOf(
          decideDisposal(
            withRecord({
              openPr: { kind: 'open' },
              activity: { kind: 'unavailable' },
              harvestOutcome: 'harvest-failed',
            }),
          ),
        ),
      ).toBe('blocked/open-pr');
      expect(
        reasonOf(
          decideDisposal(
            withRecord({
              activity: { kind: 'unavailable' },
              harvestOutcome: 'harvest-failed',
            }),
          ),
        ),
      ).toBe('blocked/in-use-unverifiable');
    });

    it('a precondition failure is reported instead of an unattributed probe error', () => {
      const outcome = decideDisposal(
        withRecord({
          probeErrors: ['probe-timeout'],
          merge: { kind: 'not-ancestor' },
        }),
      );
      expect(reasonOf(outcome)).toBe('blocked/not-merged');
    });
  });

  describe('archive caps (AC 6.6 pairs)', () => {
    // Archivable files: screenshots/a.png (600) + notes.local.md (400) =
    // 1000 bytes in 2 files; node_modules/ is allow-listed and not counted.
    it('byte cap pair: identical except for archiveMaxBytes', () => {
      expect(
        reasonOf(decideDisposal(withRecord({ archiveMaxBytes: 1_000 }))),
      ).toBe('skipped/eligible-report-only');
      expect(
        reasonOf(decideDisposal(withRecord({ archiveMaxBytes: 999 }))),
      ).toBe('blocked/archive-too-large');
    });

    it('file-count cap pair: identical except for archiveMaxFiles', () => {
      expect(reasonOf(decideDisposal(withRecord({ archiveMaxFiles: 2 })))).toBe(
        'skipped/eligible-report-only',
      );
      expect(reasonOf(decideDisposal(withRecord({ archiveMaxFiles: 1 })))).toBe(
        'blocked/archive-too-large',
      );
    });

    it('allow-list entries match only the top-level directory', () => {
      const files = [
        { relPath: 'dist', bytes: 10 },
        { relPath: 'dist/main.js', bytes: 10 },
        { relPath: '.nx/cache/x', bytes: 10 },
        { relPath: '.angular/cache/y', bytes: 10 },
        { relPath: 'coverage/lcov.info', bytes: 10 },
        { relPath: 'node_modules\\win\\path.js', bytes: 10 },
      ];
      expect(
        reasonOf(
          decideDisposal(
            withRecord({
              ignoredFiles: { kind: 'ok', files },
              archiveMaxBytes: 0,
              archiveMaxFiles: 0,
            }),
          ),
        ),
      ).toBe('skipped/eligible-report-only');
      // `libs/x/dist/` is not top-level, `distribution/` is not `dist/`.
      expect(
        reasonOf(
          decideDisposal(
            withRecord({
              ignoredFiles: {
                kind: 'ok',
                files: [
                  { relPath: 'libs/x/dist/a.js', bytes: 1 },
                  { relPath: 'distribution/b', bytes: 1 },
                ],
              },
              archiveMaxBytes: 10,
              archiveMaxFiles: 1,
            }),
          ),
        ),
      ).toBe('blocked/archive-too-large');
    });
  });

  describe('mode fields (AC 4.2, finding 21)', () => {
    it.each([
      ['off', 'none'],
      ['auto', 'auto-unavailable'],
      ['confirm', 'confirm-unavailable'],
    ] as const)(
      'requestedMode %s gives modeReason %s',
      (requestedMode, modeReason) => {
        const outcome = decideDisposal(withRecord({ requestedMode }));
        expect(outcome).toMatchObject({
          requestedMode,
          effectiveMode: 'off',
          modeReason,
          activityScope: 'in-process',
        });
      },
    );

    it('AC 4.2 (a): auto unreachable, all of P2-P11 hold', () => {
      expect(decideDisposal(withRecord({ requestedMode: 'auto' }))).toEqual({
        step: 'dispose',
        state: 'skipped',
        reason: 'eligible-report-only',
        requestedMode: 'auto',
        effectiveMode: 'off',
        modeReason: 'auto-unavailable',
        activityScope: 'in-process',
      });
    });

    it('AC 4.2 (b): auto unreachable, modified tracked file', () => {
      expect(
        decideDisposal(
          withRecord({
            requestedMode: 'auto',
            porcelain: {
              kind: 'ok',
              trackedChanges: 1,
              untrackedNonIgnored: 0,
            },
          }),
        ),
      ).toEqual({
        step: 'dispose',
        state: 'blocked',
        reason: 'dirty-tracked',
        requestedMode: 'auto',
        effectiveMode: 'off',
        modeReason: 'auto-unavailable',
        activityScope: 'in-process',
      });
    });

    it('confirm gives the report-only result with confirm-unavailable', () => {
      expect(
        decideDisposal(
          withRecord({
            requestedMode: 'confirm',
            merge: { kind: 'not-ancestor' },
          }),
        ),
      ).toMatchObject({
        state: 'blocked',
        reason: 'not-merged',
        effectiveMode: 'off',
        modeReason: 'confirm-unavailable',
      });
    });
  });

  describe('P5 missing directory (AC 4.10)', () => {
    it('(a) missing <main>/.claude-worktrees/gone-wt under the real agent dir passes', () => {
      const outcome = decideDisposal(
        withRecord({
          ...MISSING_WT,
          worktreePath: `${AGENT_DIR}/gone-wt`,
          pathResolution: {
            kind: 'missing',
            nearestParentRealPath: AGENT_DIR,
            remainingSegments: ['gone-wt'],
          },
        }),
      );
      expect(reasonOf(outcome)).toBe('skipped/eligible-report-only');
    });

    it('a missing nested path below a real subdirectory of the agent dir passes', () => {
      const outcome = decideDisposal(
        withRecord({
          ...MISSING_WT,
          pathResolution: {
            kind: 'missing',
            nearestParentRealPath: `${AGENT_DIR}/group`,
            remainingSegments: ['gone-wt', 'nested'],
          },
        }),
      );
      expect(reasonOf(outcome)).toBe('skipped/eligible-report-only');
    });

    it('(b) nearest parent is a symlink in the agent dir resolving outside it', () => {
      const outcome = decideDisposal(
        withRecord({
          ...MISSING_WT,
          pathResolution: {
            kind: 'missing',
            // `<agent>/escape` -> `/tmp/outside`: the real path is outside.
            nearestParentRealPath: '/tmp/outside',
            remainingSegments: ['gone-wt'],
          },
        }),
      );
      expect(reasonOf(outcome)).toBe('blocked/outside-agent-dir');
    });

    it('(c) a `..` segment fails', () => {
      const outcome = decideDisposal(
        withRecord({
          ...MISSING_WT,
          pathResolution: {
            kind: 'missing',
            nearestParentRealPath: AGENT_DIR,
            remainingSegments: ['..', 'escaped'],
          },
        }),
      );
      expect(reasonOf(outcome)).toBe('blocked/outside-agent-dir');
    });

    it('a missing directory is not judged on porcelain, ignored files or archive', () => {
      // MISSING_WT sets all three probes to `error`; they are not consulted.
      const outcome = decideDisposal(
        withRecord({
          ...MISSING_WT,
          pathResolution: {
            kind: 'missing',
            nearestParentRealPath: AGENT_DIR,
            remainingSegments: ['gone-wt'],
          },
        }),
      );
      expect(reasonOf(outcome)).toBe('skipped/eligible-report-only');
    });
  });

  describe('determinism (AC 6.6)', () => {
    it.each(rows)('%s gives the same outcome twice', (_name, patch) => {
      const record = withRecord(patch);
      expect(decideDisposal(record)).toEqual(decideDisposal(record));
    });

    it('does not mutate its input', () => {
      const record = eligible();
      const snapshot = JSON.stringify(record);
      decideDisposal(record);
      expect(JSON.stringify(record)).toBe(snapshot);
    });
  });
});
