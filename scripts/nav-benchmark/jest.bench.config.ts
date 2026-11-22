/**
 * Jest config of the in-process ptah runner of the offline nav benchmark.
 * Matches only `*.bench.ts`, so `scripts/jest.config.ts` (`*.spec.ts`) never
 * runs it. Run it with NAV_BENCH_STEPS_IN / NAV_BENCH_OUT set.
 */
import type { Config } from 'jest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * `jest.preset.js` maps `marked` to `<worktree>/node_modules/...`. A task
 * worktree has no `node_modules` of its own (Node resolves the parent
 * checkout's), so walk up to the first directory that holds the file.
 */
function findMarkedUmd(): string | undefined {
  let dir = process.cwd(); // jest runs from the checkout root; no __dirname in an ESM config
  for (;;) {
    const candidate = path.join(dir, 'node_modules/marked/lib/marked.umd.js');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
const markedUmd = findMarkedUmd();

const config: Config = {
  displayName: 'nav-bench',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['**/*.bench.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    ...(markedUmd ? { '^marked$': markedUmd } : {}),
    '^vscode$': '<rootDir>/../../__mocks__/vscode.ts',
    '(^|/)wasm-bundle-dir(\\.js)?$': '<rootDir>/bench-mocks/wasm-bundle-dir.ts',
  },
  transformIgnorePatterns: ['node_modules/(?!marked/)'],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'cjs', 'json'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 1_800_000,
  maxWorkers: 1,
};

export default config;
