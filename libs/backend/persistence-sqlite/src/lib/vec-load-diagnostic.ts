import * as path from 'node:path';

export type VecLoadReason =
  | 'ok'
  | 'binary-missing'
  | 'load-failed'
  | 'extensions-disabled'
  | 'no-resolver'
  | 'not-attempted';

export interface VecLoadAttemptError {
  strategy: string;
  code?: string;
  message: string;
}

export interface VecLoadDiagnostic {
  ok: boolean;
  reason: VecLoadReason;
  attemptedPath?: string;
  packageName?: string;
  fsExists?: boolean;
  electronVersion: string;
  processArch: NodeJS.Architecture;
  processPlatform: NodeJS.Platform;
  error?: { code?: string; message: string };
  errorChain?: readonly VecLoadAttemptError[];
}

const PLATFORM_PACKAGE_MAP: Readonly<Record<string, string>> = {
  'win32-x64': 'sqlite-vec-windows-x64',
  'win32-arm64': 'sqlite-vec-windows-arm64',
  'darwin-arm64': 'sqlite-vec-darwin-arm64',
  'darwin-x64': 'sqlite-vec-darwin-x64',
  'linux-x64': 'sqlite-vec-linux-x64',
  'linux-arm64': 'sqlite-vec-linux-arm64',
};

const PLATFORM_BINARY_MAP: Readonly<Record<NodeJS.Platform, string>> = {
  win32: 'vec0.dll',
  darwin: 'vec0.dylib',
  linux: 'vec0.so',
  aix: 'vec0.so',
  android: 'vec0.so',
  freebsd: 'vec0.so',
  haiku: 'vec0.so',
  openbsd: 'vec0.so',
  sunos: 'vec0.so',
  cygwin: 'vec0.dll',
  netbsd: 'vec0.so',
};

export function resolveVecPackageName(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): string | undefined {
  return PLATFORM_PACKAGE_MAP[`${platform}-${arch}`];
}

export function resolveVecBinaryName(
  platform: NodeJS.Platform = process.platform,
): string {
  return PLATFORM_BINARY_MAP[platform] ?? 'vec0.so';
}

/**
 * SQLite loads an extension with dlopen, which cannot read inside an asar
 * archive. In a packaged Electron app (also the headless worker mode),
 * `require.resolve` and `sqlite-vec`'s `getLoadablePath()` return
 * `.../resources/app.asar/node_modules/...`, while electron-builder unpacks
 * the binary to `app.asar.unpacked`. Rewrite that path segment; any other
 * path (dev checkout, plain Node) is returned unchanged.
 */
export function toUnpackedAsarPath(
  candidate: string,
  sep: string = path.sep,
): string {
  const packed = `${sep}app.asar${sep}`;
  const index = candidate.indexOf(packed);
  if (index === -1) return candidate;
  return (
    candidate.slice(0, index) +
    `${sep}app.asar.unpacked${sep}` +
    candidate.slice(index + packed.length)
  );
}

export function buildBaseDiagnostic(
  partial: Partial<VecLoadDiagnostic> = {},
): VecLoadDiagnostic {
  return {
    ok: false,
    reason: 'not-attempted',
    electronVersion: process.versions['electron'] ?? 'unknown',
    processArch: process.arch,
    processPlatform: process.platform,
    packageName: resolveVecPackageName(),
    ...partial,
  };
}
