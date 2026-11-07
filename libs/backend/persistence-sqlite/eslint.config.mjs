import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/esbuild.config.{js,ts,mjs,mts}',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  // Defense-in-depth: SQL migrations MUST be static text. A `${...}`
  // expression inside a migration template literal is a SQL-injection
  // sink — the runner passes the string straight to `db.exec()`. This
  // rule blocks the footgun at lint time so a careless edit cannot ship
  // a runtime injection vector. Pairs with the Semgrep rule at
  // .semgrep/sql-injection-in-migration.yml for CI coverage.
  {
    files: ['**/lib/migrations/**/*.ts'],
    // Specs are excluded: their SQL builds test fixtures and never reaches
    // the migration runner. The rule predates the first migration spec
    // (rule 2026-05-03, first spec 2026-05-24), and the paired Semgrep rule
    // matches only `export const sql` / `vecSql`.
    ignores: ['**/lib/migrations/index.ts', '**/lib/migrations/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TemplateLiteral[expressions.length>0]',
          message:
            'SQL migrations must be static text — `${...}` interpolation is a SQL injection sink. Move dynamic values into the migration runner instead.',
        },
      ],
    },
  },
];
