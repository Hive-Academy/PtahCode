/**
 * Real grammar resolution for the nav-benchmark runner. The production
 * `wasm-bundle-dir` uses `import.meta.url`, which CommonJS ts-jest cannot
 * parse, so this file points at the same grammar files the app ships:
 * `@vscode/tree-sitter-wasm` grammars and the `web-tree-sitter` runtime.
 * Mirrors the `jest.mock('wasm-bundle-dir')` block of
 * libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/ast-analyze-result.spec.ts.
 */
import * as path from 'path';

const grammarDir = path.join(
  path.dirname(require.resolve('@vscode/tree-sitter-wasm/package.json')),
  'wasm',
);
const runtimeDir = path.dirname(require.resolve('web-tree-sitter'));

export const BUNDLE_DIR: string = grammarDir;

export function resolveWasmPath(filename: string): string {
  return filename.startsWith('web-tree-sitter')
    ? path.join(runtimeDir, filename)
    : path.join(grammarDir, filename);
}
