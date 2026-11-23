import type { AgentActionNotice } from '@ptah-extension/shared';
import {
  announceLaneNotice,
  currentLaneNotice,
  setLaneAdmission,
  type TrackedAgent,
} from './tracked-agent';

type Lane = Pick<
  TrackedAgent,
  'laneAdmission' | 'laneNoticesAnnounced' | 'info' | 'laneNoticeChanged'
>;

const paused: AgentActionNotice = {
  actor: 'ptah-budget',
  action: 'paused',
  reason: 'weighted-budget',
  nextStep: 'review-live-agent',
};
const ask: AgentActionNotice = {
  actor: 'ptah-watchdog',
  action: 'asked-handoff',
  reason: 'lane-inactive',
  nextStep: 'return-report',
};

function lane(): Lane & { changes: Array<AgentActionNotice | undefined> } {
  const changes: Array<AgentActionNotice | undefined> = [];
  return {
    info: { agentId: 'lane-1' } as TrackedAgent['info'],
    laneNoticeChanged: (current) => changes.push(current),
    changes,
  };
}

describe('lane notice priority across monitors', () => {
  it('keeps the pause as the current notice after a lower handoff ask', () => {
    const tracked = lane();
    announceLaneNotice(tracked, 'budget', paused);
    announceLaneNotice(tracked, 'inactivity', ask);

    expect(currentLaneNotice(tracked)).toEqual(paused);
    expect(tracked.info.actionNotice).toEqual(paused);
  });

  it('keeps the pause visible when the other monitor clears its ask', () => {
    const tracked = lane();
    announceLaneNotice(tracked, 'budget', paused);
    announceLaneNotice(tracked, 'inactivity', ask);

    setLaneAdmission(tracked, 'inactivity', undefined);

    expect(tracked.info.actionNotice).toEqual(paused);
    // The effective notice did not change, so no release event is sent.
    expect(tracked.changes).toEqual([]);
  });

  it('sends the remaining ask when the pause clears but another ask stays', () => {
    const tracked = lane();
    announceLaneNotice(tracked, 'budget', paused);
    announceLaneNotice(tracked, 'inactivity', ask);

    setLaneAdmission(tracked, 'budget', undefined);

    expect(tracked.info.actionNotice).toEqual(ask);
    expect(tracked.changes).toEqual([ask]);
  });

  it('sends a null release when the last monitor clears', () => {
    const tracked = lane();
    announceLaneNotice(tracked, 'budget', paused);

    setLaneAdmission(tracked, 'budget', undefined);

    expect(tracked.info.actionNotice).toBeUndefined();
    expect(tracked.changes).toEqual([undefined]);
  });
});
