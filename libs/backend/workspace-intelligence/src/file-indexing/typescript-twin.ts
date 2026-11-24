const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const TYPESCRIPT_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;
const IGNORE_CASE = process.platform === 'win32';
const DECLARATION_SUFFIX = /\.d\.(?:ts|mts|cts)$/;

function isDeclarationPath(path: string): boolean {
  return DECLARATION_SUFFIX.test(IGNORE_CASE ? path.toLowerCase() : path);
}

export function isJavaScriptPath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  const extension = path.slice(dot);
  return JAVASCRIPT_EXTENSIONS.has(
    IGNORE_CASE ? extension.toLowerCase() : extension,
  );
}

/** Returns source siblings with the same stem and separators as the input. */
export function typeScriptTwinCandidates(path: string): readonly string[] {
  if (!isJavaScriptPath(path)) return [];
  const stem = path.slice(0, path.lastIndexOf('.'));
  return TYPESCRIPT_SOURCE_EXTENSIONS.map((extension) => stem + extension);
}

/** The probe checks for a file and honors exact path spelling outside Windows. */
export async function hasTypeScriptSourceTwin(
  path: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<boolean> {
  for (const candidate of typeScriptTwinCandidates(path)) {
    if (isDeclarationPath(candidate)) continue;
    try {
      if (await exists(candidate)) return true;
    } catch {
      // A failed probe cannot establish that the JavaScript is redundant.
    }
  }
  return false;
}

/**
 * Tests the discovered paths without filesystem probes. Set keys and callback
 * arguments use forward slashes and are lowercased on Windows. Build the
 * lookup with the same normalization as the candidate paths.
 */
export function hasTypeScriptSourceTwinIn(
  path: string,
  present: ReadonlySet<string> | ((candidate: string) => boolean),
): boolean {
  return typeScriptTwinCandidates(path).some((candidate) => {
    if (isDeclarationPath(candidate)) return false;
    const slashes = candidate.replaceAll('\\', '/');
    const key = IGNORE_CASE ? slashes.toLowerCase() : slashes;
    return typeof present === 'function' ? present(key) : present.has(key);
  });
}
