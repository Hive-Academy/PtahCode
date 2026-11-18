import type { MemoryGraphNodeWire } from '@ptah-extension/shared';
import type { GraphPalette } from './graph.types';
import { colorOf, edgeDash, edgeOpacity, radiusOf } from './node-style';
const node = { kind: 'fact', tier: 'core', salience: 0.5, hits: 3, sessionId: null, subject: null } as MemoryGraphNodeWire;
const palette: GraphPalette = { kind: { fact: 'red', event: 'blue', entity: 'green', preference: 'yellow' }, tier: { core: 'gold', recall: 'gray', archival: 'black' }, session: [], cluster: [], fallback: 'white' };
it.each([['kind', 'red'], ['tier', 'gold'], ['session', 'white'], ['cluster', 'white']] as const)('color %s', (by, expected) => expect(colorOf(node, by, palette)).toBe(expected));
it.each([['uniform', 6], ['salience', 10], ['hits', 8]] as const)('radius %s', (by, expected) => expect(radiusOf(node, by)).toBe(expected));
it.each([['semantic', 'solid'], ['subject', 'dashed'], ['session', 'dotted']] as const)('dash %s', (kind, expected) => expect(edgeDash(kind)).toBe(expected));
it.each([['semantic', 0.6, 0.6], ['subject', 1, 0.7]] as const)('opacity %s', (kind, weight, expected) => expect(edgeOpacity(kind, weight)).toBe(expected));
