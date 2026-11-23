import 'reflect-metadata';
import { container } from 'tsyringe';
import { TOKENS } from '@ptah-extension/vscode-core';
import { REVIEW_CORE_TOKENS } from '../../di/tokens';
import { REVIEW_LANE_TOKENS } from './review-lane-admission.service';
import { ReviewLaneAttempt } from './review-lane-attempt';
import { ReviewLaneSelectionService } from './review-lane-selection.service';

describe('ReviewLaneSelectionService', () => {
  const source = {
    list: jest.fn(async () => ({ lanes: [{ id: 'a', label: 'a', family: 'fa', limitState: 'confirmed-room' as const }], maxConcurrentAgents: 2 })),
    listModels: jest.fn(async () => ({})),
    modelBlocked: jest.fn(() => false),
  };
  const store = { get: jest.fn(async () => ({ pool: [], pins: {} })), update: jest.fn() };
  const clock = { now: () => 0, setTimeout: jest.fn(), clearTimeout: jest.fn() };

  it('resolves through its tokens and hands each attempt independent state', async () => {
    const child = container.createChildContainer();
    child.register(REVIEW_LANE_TOKENS.GATEWAY, { useValue: source });
    child.register(REVIEW_CORE_TOKENS.LANE_SETTINGS_STORE, { useValue: store });
    child.register(REVIEW_LANE_TOKENS.CLOCK, { useValue: clock });
    child.register(TOKENS.LOGGER, { useValue: { warn: jest.fn() } });
    const service = child.resolve(ReviewLaneSelectionService);
    const first = service.beginAttempt();
    const second = service.beginAttempt(new AbortController().signal);
    expect(first).toBeInstanceOf(ReviewLaneAttempt);
    expect(second).not.toBe(first);
    await first.choose({ kind: 'triage' });
    await first.choose({ kind: 'verifier' });
    await second.choose({ kind: 'triage' });
    expect(store.get).toHaveBeenCalledTimes(2);
    expect(source.list).toHaveBeenCalledTimes(3);
  });
});
