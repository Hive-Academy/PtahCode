import { execFile as execFileCallback } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import picomatch from 'picomatch';
import { z } from 'zod';
import { walkGlobMatches } from '@ptah-extension/platform-core';
import { DEFAULT_WORKSPACE_EXCLUDES } from '@ptah-extension/workspace-intelligence';
import { canonicalPathInsideRoot } from '../../namespace-builders/browser-file-url';
import { describeZodIssues } from '../route-tool-handlers';
import { handleGrep, type GrepDeps } from './grep';
import { validateWorkspaceGlob } from '../glob-pattern-validation';
import { resolveNavWorkspacePath } from './nav-workspace-path';
import { handleReadSymbol, type ReadSymbolDeps } from './read-symbol';
import {
  INSPECT_DEFAULT_GREP_MATCHES,
  INSPECT_DEFAULT_LIST_LIMIT,
  INSPECT_DEFAULT_READ_LINES,
  INSPECT_MAX_GREP_MATCHES,
  INSPECT_MAX_LIST_LIMIT,
  INSPECT_MAX_OPS,
  INSPECT_MAX_READ_LINES,
  INSPECT_MAX_RESULT_CHARS,
  INSPECT_MAX_SECTION_CHARS,
  INSPECT_TOOL_NAME,
} from './inspect.limits';

const execFile = promisify(execFileCallback);
const readSchema = z.object({ op: z.literal('read'), file: z.string().min(1).optional(), name: z.string().optional(), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional(), maxLines: z.number().int().positive().optional() }).passthrough();
const grepSchema = z.object({ op: z.literal('grep'), pattern: z.string().min(1), path: z.string().optional(), glob: z.string().optional(), maxMatches: z.number().int().positive().optional(), includeIgnored: z.boolean().optional(), regex: z.boolean().optional(), caseSensitive: z.boolean().optional(), context: z.number().int().min(0).max(5).optional() }).passthrough();
const listSchema = z.object({ op: z.literal('list'), pattern: z.string().min(1), limit: z.number().int().positive().optional() }).strict();
const gitSchema = z.object({ op: z.literal('git'), action: z.enum(['status', 'diff_stat', 'log', 'branch']), base: z.string().regex(/^(?!-)[A-Za-z0-9._/-]{1,200}$/).optional(), limit: z.number().int().positive().optional() }).strict();
const opsSchema = z.array(z.unknown()).min(1).max(INSPECT_MAX_OPS);

export interface InspectDeps extends GrepDeps, ReadSymbolDeps {
  readonly defaultWorkspaceRoot: () => Promise<string | undefined>;
  readonly allowedWorkspaceRoots?: () => Promise<readonly string[]>;
  readonly listFiles?: (pattern: string, limit: number, root: string) => Promise<readonly string[]>;
  readonly runGit?: (args: readonly string[], cwd: string) => Promise<string>;
}
export interface InspectReply { readonly isError: boolean; readonly text: string; }

async function runGit(args: readonly string[], cwd: string): Promise<string> {
  const result = await execFile('git', [...args], { cwd, timeout: 10_000, maxBuffer: 1_000_000, windowsHide: true });
  return result.stdout.trimEnd();
}

async function resolveListRoot(root: string, pattern: string): Promise<string> {
  const realRoot = await realpath(root);
  const staticBase = picomatch.scan(pattern).base.replace(/\\(.)/g, '$1');
  let basePath = path.resolve(root, staticBase);
  while (true) {
    let realBase: string;
    try {
      realBase = await realpath(basePath);
    } catch (error: unknown) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
      const parent = path.dirname(basePath);
      if (parent === basePath) return realRoot;
      if (!canonicalPathInsideRoot(parent, realRoot)) {
        throw new Error('pattern walk base resolves outside the workspace root.', { cause: error });
      }
      basePath = parent;
      continue;
    }
    if (!canonicalPathInsideRoot(realBase, realRoot)) {
      throw new Error('pattern walk base resolves outside the workspace root.');
    }
    return realRoot;
  }
}

async function findWorkspaceFiles(root: string, pattern: string, limit: number): Promise<{ readonly matches: readonly string[]; readonly failures: number; readonly capped: boolean }> {
  let failures = 0;
  const realRoot = await realpath(root);
  const matches: string[] = [];
  const rawWalkCap = limit * 20;
  let rawWalkCount = 0;
  let capped = false;
  for await (const match of walkGlobMatches(pattern, {
    cwd: root,
    exclude: [...DEFAULT_WORKSPACE_EXCLUDES],
    dot: false,
    shouldFollowDirectorySymlink: async (linkPath) =>
      canonicalPathInsideRoot(await realpath(linkPath), realRoot),
    // A validated root is already open; an unreadable child should leave a
    // partial list instead of turning the entire inspect operation into an error.
    onFailure: () => { failures += 1; },
  })) {
    rawWalkCount += 1;
    if (rawWalkCount > rawWalkCap) {
      capped = true;
      break;
    }
    try {
      const targetReal = await realpath(match);
      if (!canonicalPathInsideRoot(targetReal, realRoot)) continue;
      matches.push(path.relative(realRoot, targetReal).split(path.sep).join('/'));
      if (matches.length === limit) break;
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return { matches, failures, capped };
}

async function filterContainedFiles(root: string, matches: readonly string[]): Promise<readonly string[]> {
  const realRoot = await realpath(root);
  const contained: string[] = [];
  for (const match of matches) {
    try {
      const targetReal = await realpath(path.resolve(root, match));
      if (canonicalPathInsideRoot(targetReal, realRoot)) {
        contained.push(path.relative(realRoot, targetReal).split(path.sep).join('/'));
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }
  return contained;
}

function gitArgs(op: z.infer<typeof gitSchema>): string[] {
  switch (op.action) {
    case 'status': return ['--no-optional-locks', '-c', 'status.relativePaths=true', 'status', '--short', '--branch', '--', '.'];
    case 'diff_stat': return op.base ? ['diff', '--stat', '--relative', `${op.base}...HEAD`, '--', '.'] : ['diff', '--stat', '--relative', '--', '.'];
    case 'log': return ['log', '--oneline', '-n', String(Math.min(op.limit ?? 10, 20)), '--', '.'];
    case 'branch': return ['branch', '--show-current'];
  }
}

function cut(text: string, budget: number, footer: string): string {
  if (text.length <= budget) return text;
  return `${text.slice(0, Math.max(0, budget - footer.length - 1))}\n${footer}`;
}

async function runOp(raw: unknown, index: number, root: string, deps: InspectDeps): Promise<{ ok: boolean; header: string; body: string }> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, header: `## ${index} invalid`, body: `ERROR op #${index}: expected an operation object` };
  const value = raw as Record<string, unknown>;
  const opName = typeof value['op'] === 'string' ? value['op'] : 'invalid';
  const schema = opName === 'read' ? readSchema : opName === 'grep' ? grepSchema : opName === 'list' ? listSchema : opName === 'git' ? gitSchema : undefined;
  if (!schema) return { ok: false, header: `## ${index} ${opName}`, body: `ERROR op #${index}: unknown op; valid op keys: read(file,name,startLine,endLine,maxLines), grep(pattern,path,glob,maxMatches,includeIgnored,regex,caseSensitive,context), list(pattern,limit), git(action,base,limit)` };
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { ok: false, header: `## ${index} ${opName}`, body: `ERROR op #${index}: ${describeZodIssues(parsed.error)}; valid keys: ${Object.keys(schema.shape).join(', ')}` };
  const aliases: Readonly<Record<string, readonly string[]>> = {
    read: ['offset', 'limit', 'file_path', 'path'],
    grep: ['head_limit', 'type', 'output_mode', '-i', '-n', '-C', '-A', '-B'],
    list: [], git: [],
  };
  const known = new Set([...Object.keys(schema.shape), ...(aliases[opName] ?? [])]);
  const unknown = Object.keys(value).filter((key) => !known.has(key));
  if (unknown.length) return { ok: false, header: `## ${index} ${opName}`, body: `ERROR op #${index}: unknown keys: ${unknown.join(', ')}; valid keys: ${[...known].join(', ')}` };
  try {
    const inner = { ...value };
    delete inner['op'];
    if (opName === 'read') {
      const op = parsed.data as z.infer<typeof readSchema>;
      if (value['limit'] !== undefined && (typeof value['limit'] !== 'number' || !Number.isFinite(value['limit']) || !Number.isInteger(value['limit']))) throw new Error('alias "limit" must be a finite integer');
      const readInput: Record<string, unknown> = {
        ...inner,
        maxLines: op.maxLines ?? (typeof value['limit'] === 'number' && Number.isFinite(value['limit']) ? Math.min(value['limit'], INSPECT_MAX_READ_LINES) : INSPECT_DEFAULT_READ_LINES),
        workspaceRoot: root,
      };
      if (op.startLine !== undefined) readInput['startLine'] = op.startLine;
      else if (op.name === undefined && value['offset'] === undefined) readInput['startLine'] = 1;
      const reply = await handleReadSymbol(readInput, deps);
      const startLine = op.startLine ?? (typeof value['offset'] === 'number' && Number.isFinite(value['offset']) ? value['offset'] : 1);
      const maxLines = op.maxLines ?? (typeof value['limit'] === 'number' && Number.isFinite(value['limit']) ? Math.min(value['limit'], INSPECT_MAX_READ_LINES) : INSPECT_DEFAULT_READ_LINES);
      return { ok: !reply.isError, header: `## ${index} read ${String(op.file ?? value['file_path'] ?? value['path'] ?? '')}:${op.name ?? `${startLine}-${op.endLine ?? startLine + maxLines - 1}`}`, body: reply.isError ? `ERROR op #${index}: ${reply.text}` : reply.text };
    }
    if (opName === 'grep') {
      const op = parsed.data as z.infer<typeof grepSchema>;
      if (value['head_limit'] !== undefined && (typeof value['head_limit'] !== 'number' || !Number.isFinite(value['head_limit']) || !Number.isInteger(value['head_limit']))) throw new Error('alias "head_limit" must be a finite integer');
      const requestedMatches =
        op.maxMatches ??
        (typeof value['head_limit'] === 'number' ? value['head_limit'] : undefined);
      const maxMatches =
        requestedMatches === undefined
          ? INSPECT_DEFAULT_GREP_MATCHES
          : Math.min(requestedMatches, INSPECT_MAX_GREP_MATCHES);
      const reply = await handleGrep({ ...inner, maxMatches, inlineBody: false, workspaceRoot: root }, deps);
      return { ok: !reply.isError, header: `## ${index} grep ${op.pattern}`, body: reply.isError ? `ERROR op #${index}: ${reply.text}` : reply.text };
    }
    if (opName === 'list') {
      const op = parsed.data as z.infer<typeof listSchema>;
      const validatedPattern = validateWorkspaceGlob(op.pattern, root);
      if (validatedPattern.error) throw new Error(validatedPattern.error);
      const limit = Math.min(op.limit ?? INSPECT_DEFAULT_LIST_LIMIT, INSPECT_MAX_LIST_LIMIT);
      const listLimit = limit + 1;
      const realRoot = await resolveListRoot(root, op.pattern);
      const walked = deps.listFiles
        ? { matches: await deps.listFiles(op.pattern, listLimit, realRoot), failures: 0, capped: false }
        : await findWorkspaceFiles(realRoot, op.pattern, listLimit);
      const matches = deps.listFiles ? await filterContainedFiles(realRoot, walked.matches) : walked.matches;
      const partial = matches.length > 0;
      const incompleteNotes = [
        ...(walked.failures > 0 ? [`incomplete: ${walked.failures} director${walked.failures === 1 ? 'y' : 'ies'} could not be read`] : []),
        ...(walked.capped ? [`incomplete: stopped after ${listLimit * 20} raw file matches to bound the workspace walk`] : []),
      ];
      const body = [
        ...matches.slice(0, limit),
        ...(matches.length > limit ? [`… more files; continue with a narrower pattern or higher limit (max ${INSPECT_MAX_LIST_LIMIT})`] : []),
        ...incompleteNotes,
      ].join('\n') || 'No files matched.';
      return { ok: (walked.failures === 0 && !walked.capped) || partial, header: `## ${index} list ${op.pattern}`, body: !partial && incompleteNotes.length ? `ERROR op #${index}: No files matched.\n${incompleteNotes.join('\n')}` : body };
    }
    const op = parsed.data as z.infer<typeof gitSchema>;
    if (op.action !== 'diff_stat' && op.base !== undefined) throw new Error('base is only valid for diff_stat');
    const resolved = await resolveNavWorkspacePath('.', root);
    if (!resolved.ok) throw new Error(resolved.error);
    const text = await (deps.runGit ?? runGit)(gitArgs(op), resolved.value.rootReal);
    return { ok: true, header: `## ${index} git ${op.action}`, body: text || '(no output)' };
  } catch (error: unknown) {
    return { ok: false, header: `## ${index} ${opName}`, body: `ERROR op #${index}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function handleInspect(raw: unknown, deps: InspectDeps): Promise<InspectReply> {
  const top = z.object({ workspaceRoot: z.string().trim().min(1).optional(), ops: opsSchema }).strict().safeParse(raw);
  if (!top.success) return { isError: true, text: `Error: invalid ${INSPECT_TOOL_NAME} arguments — ${describeZodIssues(top.error)}` };
  const allowedRoot = await deps.defaultWorkspaceRoot();
  const registeredRoots = await deps.allowedWorkspaceRoots?.();
  const allowedRoots = registeredRoots?.length ? [...registeredRoots] : allowedRoot ? [allowedRoot] : [];
  if (allowedRoots.length === 0) return { isError: true, text: 'Error: no workspace is open.' };
  const root = top.data.workspaceRoot ?? allowedRoot;
  if (!root) return { isError: true, text: 'Error: no workspace is open.' };
  let resolved = await resolveNavWorkspacePath(root, allowedRoots[0] ?? allowedRoot);
  for (const allowed of allowedRoots.slice(1)) {
    if (resolved.ok) break;
    resolved = await resolveNavWorkspacePath(root, allowed);
  }
  if (!resolved.ok) return { isError: true, text: resolved.error };
  if (!resolved.value.isDirectory) return { isError: true, text: 'Error: workspaceRoot must be a directory inside the active workspace.' };
  const results: Array<Awaited<ReturnType<typeof runOp>>> = new Array(top.data.ops.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < top.data.ops.length) {
      const index = next++;
      results[index] = await runOp(top.data.ops[index], index + 1, resolved.value.absolutePath, deps);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const succeeded = results.filter((item) => item.ok).length;
  const sections = results.map((result) => {
    const text = cut(result.body, INSPECT_MAX_SECTION_CHARS, '… section cut; continue with a smaller read range or narrower query.');
    return `${result.header}\n${text}`;
  });
  let output = `ptah_inspect root=${resolved.value.absolutePath} ops=${results.length} ok=${succeeded} failed=${results.length - succeeded}\n${sections.join('\n\n')}`;
  if (output.length > INSPECT_MAX_RESULT_CHARS) output = cut(output, INSPECT_MAX_RESULT_CHARS, '… result cut; continue with fewer ops or narrower results.');
  return { isError: succeeded === 0, text: output };
}
