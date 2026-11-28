import { validateWorkspaceGlob } from './glob-pattern-validation';

describe('validateWorkspaceGlob', () => {
  const root = 'C:/workspace';

  it.each([
    '..', './../x', 'sub/../../x', '..\\x', '.\\./outside/*.ts',
    '**/../../x', 'src/**/..', '{..,src}/*.ts', '[.][.]/x',
    'C:/x/*.ts', 'C:\\x\\*.ts', 'c:x', '\\\\server\\share\\*',
    '//server/share/*', '/etc/*', 'a\0b/*.ts',
    'sub/\\.\\./\\.\\./x', '\\.\\./x', '.\\.', 'C\\:/x/*.ts', '\\/etc/*',
    '{src,..}/x', '[.]./x',
  ])('rejects unsafe pattern %s', (pattern) => {
    expect(validateWorkspaceGlob(pattern, root).error).toBeDefined();
  });

  it.each([
    '**/*.ts', 'src/**/auth*', '*.spec.ts', '{a,b}/**/*.md',
    'app/\\[id\\]/*.tsx', 'docs/[a-c]*.md', 'file..name.ts', 'a/..b/c.ts',
    'a/b../c.ts', 'src\\lib\\*.ts',
  ])('accepts pattern %s without returning a rewrite', (pattern) => {
    expect(validateWorkspaceGlob(pattern, root)).toEqual({});
  });
});
