import 'reflect-metadata';
import type { CliDetectionResult } from '@ptah-extension/shared';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import { EMPTY_OUTCOME_FIGURES } from '../matrix/outcome-figures';
import { FAMILY_PROFILE_MODEL } from '../matrix/matrix.types';
import { emptyRotationState } from '../ranking/rotation.store';
import { gatherRouteCall } from './gather';

it('records a thrown child eligibility check as ineligible with a reason', async () => {
  const logger: LaneRoutingLogger = {
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  };
  const gathered = await gatherRouteCall({
    source: {
      rows: async () => [] as CliDetectionResult[],
      limits: async () => new Map(),
      roles: async () => [],
      childSessionEligible: () => { throw new Error('unavailable'); },
    },
    listing: undefined,
    matrix: { load: async () => ({
      outcomeFigures: EMPTY_OUTCOME_FIGURES,
      reasons: [],
      resolve: (family, model, taskKind) => ({
        family, model, profileModel: FAMILY_PROFILE_MODEL, taskKind,
        cell: { kind: 'unknown' as const }, score: 50, noProfile: true,
      }),
    }) },
    rotation: { load: () => ({ state: emptyRotationState(), reason: null }),
      save: async () => ({ persisted: true }) },
    logger, nowMs: 0, listingBudgetMs: 1,
  });
  expect(gathered.childSessionEligible).toBe(false);
  expect(gathered.detailReasons).toContain('Child session eligibility could not be checked');
  expect(logger.warn).toHaveBeenCalled();
});
