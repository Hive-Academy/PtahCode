import { missingCapabilityLabel } from './assemble-gate';
import type { UnavailablePhase } from '../ranking/hard-constraints';

const unavailable: UnavailablePhase = {
  phaseId: 'phase', status: 'unavailable', exclusionReason: 'missing-capability',
  excluded: [{ candidate: 'lane', rule: 'missing-capability', capability: 'browser' }],
  pinRule: null, needsDisclosedFallback: false,
};

it('names the excluded capability', () => {
  expect(missingCapabilityLabel(unavailable)).toBe('browser');
});

it('uses the typed reason when an exclusion has no capability name', () => {
  expect(missingCapabilityLabel({ ...unavailable, excluded: [] })).toBe('missing-capability');
});
