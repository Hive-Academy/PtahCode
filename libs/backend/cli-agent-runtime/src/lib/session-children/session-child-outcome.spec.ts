import { SESSION_CHILD_OUTCOME_UNKNOWN_REASON } from '@ptah-extension/shared';
import {
  childOutcomeOf,
  type SessionChildEndCause,
} from './session-child-outcome';

const ENDED_AT = '2026-11-11T04:00:00.000Z';
const PARENT = 'parent-sdk-1';

describe('childOutcomeOf (TASK_2026_932)', () => {
  it('returns undefined when the record is not terminal', () => {
    expect(childOutcomeOf({})).toBeUndefined();
    expect(
      childOutcomeOf({ endedAt: ENDED_AT, endCause: 'user-stop' }),
    ).toBeUndefined();
  });

  it('maps handed-off to the latest successor, else to succeededBy', () => {
    const record = {
      terminalStatus: 'handed-off',
      endReason: 'free text never parsed',
      endedAt: ENDED_AT,
      succeededBy: 'b',
      endCause: 'handed-off',
    } as const;
    expect(childOutcomeOf(record, 'c')).toEqual({
      kind: 'handed-off',
      reason: 'handed off to c',
      cause: 'handed-off',
      endedAt: ENDED_AT,
      successorId: 'c',
    });
    expect(childOutcomeOf(record)).toEqual({
      kind: 'handed-off',
      reason: 'handed off to b',
      cause: 'handed-off',
      endedAt: ENDED_AT,
      successorId: 'b',
    });
  });

  it('maps stopped by the parent with the parent id in the reason', () => {
    expect(
      childOutcomeOf({
        terminalStatus: 'stopped',
        parentSessionId: PARENT,
        endReason: 'stopped-by-parent',
        endedAt: ENDED_AT,
        endCause: 'parent-stop',
      }),
    ).toEqual({
      kind: 'stopped',
      reason: `stopped by the parent session ${PARENT} (ptah_session_stop)`,
      cause: 'parent-stop',
      endedAt: ENDED_AT,
    });
  });

  it.each([
    // Review m1: a host exit interrupts the child even when dispose marked it stopped.
    ['stopped', 'host-shutdown', 'interrupted', 'host exit or restart'],
    ['stopped', 'workspace-close', 'interrupted', 'workspace closed'],
    ['timed-out', 'runtime-cap', 'timed-out', 'runtime cap reached'],
    ['failed', 'provider-error', 'failed', 'provider error'],
    ['failed', 'first-turn-not-started', 'failed', 'first turn did not start'],
  ] as const)(
    'maps %s with cause %s to %s',
    (terminalStatus, endCause, kind, reason) => {
      expect(
        childOutcomeOf({ terminalStatus, endedAt: ENDED_AT, endCause }),
      ).toEqual({ kind, reason, cause: endCause, endedAt: ENDED_AT });
    },
  );

  it.each([
    ['user-stop', true, 'completed'],
    ['user-stop', false, 'stopped'],
    ['parent-stop', true, 'completed'],
    ['parent-stop', false, 'stopped'],
  ] as const)(
    'maps ended + %s (delivered %s) to %s',
    (endCause, delivered, kind) => {
      expect(
        childOutcomeOf({
          terminalStatus: 'ended',
          parentSessionId: PARENT,
          endedAt: ENDED_AT,
          endCause,
          lastCompletion: { delivered },
        })?.kind,
      ).toBe(kind);
    },
  );

  it('maps ended + user-stop without a completion to stopped by the user', () => {
    expect(
      childOutcomeOf({
        terminalStatus: 'ended',
        endedAt: ENDED_AT,
        endCause: 'user-stop',
      }),
    ).toEqual({
      kind: 'stopped',
      reason: 'stopped by the user (stop button or tab closed)',
      cause: 'user-stop',
      endedAt: ENDED_AT,
    });
  });

  it.each<[SessionChildEndCause, string]>([
    ['host-shutdown', 'host exit or restart'],
    ['workspace-close', 'workspace closed'],
    ['stream-exit', 'the agent stream exited'],
    ['provider-error', 'provider error'],
    ['compaction-abort', 'context compaction did not finish'],
    ['config-reinit', 'configuration reloaded'],
    ['unknown', 'the session ended for an unknown reason'],
  ])('maps ended + %s to interrupted even after a delivered turn', (endCause, reason) => {
    expect(
      childOutcomeOf({
        terminalStatus: 'ended',
        endedAt: ENDED_AT,
        endCause,
        lastCompletion: { delivered: true },
      }),
    ).toEqual({ kind: 'interrupted', reason, cause: endCause, endedAt: ENDED_AT });
  });

  it('maps ended with no recorded cause to unknown and never guesses from text', () => {
    expect(
      childOutcomeOf({
        terminalStatus: 'ended',
        endReason: 'ended outside the spawner (user-stop)',
        endedAt: ENDED_AT,
        lastCompletion: { delivered: true },
      }),
    ).toEqual({
      kind: 'unknown',
      reason: SESSION_CHILD_OUTCOME_UNKNOWN_REASON,
      endedAt: ENDED_AT,
    });
  });

  it('keeps the status kind and recorded reason for other statuses without a cause', () => {
    expect(
      childOutcomeOf({
        terminalStatus: 'stopped',
        endReason: 'stopped-by-parent',
        endedAt: ENDED_AT,
      }),
    ).toEqual({ kind: 'stopped', reason: 'stopped-by-parent', endedAt: ENDED_AT });
  });
});
