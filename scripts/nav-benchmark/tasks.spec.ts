/**
 * Integrity spec of the navigation benchmark task set. Fast: it reads files only,
 * it runs no shell command and no ptah tool.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

import { NAV_TASKS } from './tasks';
import { NAV_TASK_KINDS, type NavStep, type NavTask } from './types';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SPAWNER =
  'libs/backend/cli-agent-runtime/src/lib/session-children/session-spawner.service.ts';
const PR_EDITED_PREFIXES = [
  'libs/backend/vscode-lm-tools/',
  'libs/backend/workspace-intelligence/src/ast',
  'libs/backend/agent-sdk/src/lib/prompt-harness',
];

function stepStrings(step: NavStep): string[] {
  if ('shell' in step) return [step.shell];
  return [step.tool, ...collectStrings(step.args)];
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

function taskStrings(task: NavTask): string[] {
  const steps = [
    ...task.strategies.shell,
    ...task.strategies.before,
    ...task.strategies.after,
  ];
  return [
    task.id,
    task.question,
    task.source,
    ...task.expect,
    ...(task.expectFile ? [task.expectFile] : []),
    ...steps.flatMap(stepStrings),
  ];
}

function readRepoFile(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

describe('NAV_TASKS', () => {
  it('has at least 24 tasks with unique ids', () => {
    expect(NAV_TASKS.length).toBeGreaterThanOrEqual(24);
    const ids = NAV_TASKS.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every kind with at least two tasks', () => {
    for (const kind of NAV_TASK_KINDS) {
      const count = NAV_TASKS.filter((task) => task.kind === kind).length;
      expect({ kind, ok: count >= 2 }).toEqual({ kind, ok: true });
    }
  });

  it.each(NAV_TASKS.map((task) => [task.id, task] as const))(
    '%s has three non-empty strategies and non-empty expects',
    (_id, task) => {
      expect(task.strategies.shell.length).toBeGreaterThan(0);
      expect(task.strategies.before.length).toBeGreaterThan(0);
      expect(task.strategies.after.length).toBeGreaterThan(0);
      expect(task.expect.length).toBeGreaterThan(0);
      for (const needle of task.expect) expect(needle.trim()).not.toBe('');
    },
  );

  it.each(NAV_TASKS.map((task) => [task.id, task] as const))(
    '%s expects occur in the real repository',
    (_id, task) => {
      if (task.expectFile) {
        const content = readRepoFile(task.expectFile);
        const missing = task.expect.filter(
          (needle) => !content.includes(needle),
        );
        expect(missing).toEqual([]);
        return;
      }
      const notFiles = task.expect.filter((relative) => {
        const absolute = path.join(REPO_ROOT, relative);
        return !existsSync(absolute) || !statSync(absolute).isFile();
      });
      expect(notFiles).toEqual([]);
    },
  );

  it('targets the session spawner in at least five tasks', () => {
    const count = NAV_TASKS.filter((task) =>
      taskStrings(task).some((value) => value.includes(SPAWNER)),
    ).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('targets no file that the navigation-tools PR edits', () => {
    const hits = NAV_TASKS.flatMap((task) =>
      taskStrings(task)
        .filter((value) =>
          PR_EDITED_PREFIXES.some((prefix) => value.includes(prefix)),
        )
        .map((value) => `${task.id}: ${value}`),
    );
    expect(hits).toEqual([]);
  });

  it('uses only workspace-relative paths', () => {
    const absolute = NAV_TASKS.flatMap((task) =>
      taskStrings(task)
        .filter(
          (value) =>
            /(^|\s|=)\/[A-Za-z]/.test(value) || /^[A-Za-z]:[\\/]/.test(value),
        )
        .map((value) => `${task.id}: ${value}`),
    );
    expect(absolute).toEqual([]);
    const source = readFileSync(path.join(__dirname, 'tasks.ts'), 'utf8');
    expect(source).not.toContain('/home/');
  });
});
