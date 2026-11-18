import { nearestInDirection, nextLinked } from './keyboard-nav';
const positions = [
  { id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 2 },
  { id: 'c', x: -2, y: 0 }, { id: 'd', x: 2, y: 0 },
];
it.each([
  ['up', null], ['down', 'b'], ['left', 'c'], ['right', 'd'],
] as const)('%s navigation', (direction, id) => expect(nearestInDirection(positions, 'a', direction)).toBe(id));
it.each([[0, 'b'], [1, 'c'], [2, 'b']] as const)('linked %s', (index, id) => {
  expect(nextLinked([{ source: 'a', target: 'c', kind: 'subject', weight: 1 }, { source: 'a', target: 'b', kind: 'session', weight: 1 }], 'a', index)).toBe(id);
});
