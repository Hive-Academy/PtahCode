import * as path from 'node:path';
import picomatch from 'picomatch';

export interface ValidatedWorkspaceGlob {
  readonly error?: string;
}

const ABSOLUTE_PATTERN = /^(?:[/\\]|[A-Za-z]:)/;

/** The glob walk removes backslash escapes from its base; check that form too. */
function unescapeGlob(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

function hasParentSegment(value: string): boolean {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) =>
      segment.replace(/[[\]{}]/g, '').split(',').includes('..'),
    );
}

/** Reject unsafe workspace globs without changing the provider pattern. */
export function validateWorkspaceGlob(
  pattern: string,
  root: string,
): ValidatedWorkspaceGlob {
  if (pattern.includes('\0')) {
    return { error: 'pattern must not contain a NUL character.' };
  }
  // A backslash is a separator on Windows and an escape in a glob, so both
  // readings of the pattern must be safe.
  const readings = [pattern, unescapeGlob(pattern)];
  if (readings.some((reading) => ABSOLUTE_PATTERN.test(reading))) {
    return {
      error: 'pattern must be a relative glob inside the workspace root.',
    };
  }
  if (readings.some(hasParentSegment)) {
    return { error: 'pattern must not contain a .. segment.' };
  }

  const base = unescapeGlob(picomatch.scan(pattern).base);
  const relative = path.relative(
    path.resolve(root),
    path.resolve(root, base),
  );
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return { error: 'pattern walk base must remain inside the workspace root.' };
  }
  return {};
}
