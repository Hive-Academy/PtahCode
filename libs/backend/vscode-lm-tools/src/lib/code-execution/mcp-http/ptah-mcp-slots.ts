/**
 * Which config files Ptah's OWN MCP server is declared in, and at what scope.
 *
 * Until now the answer was "one file": `{ws}/.mcp.json`. Every rival CLI got
 * the server handed to it IN-PROCESS at spawn time instead — Codex via SDK
 * config, Copilot via `--additional-mcp-config`, Cursor via `agentOptions`,
 * opencode via `OPENCODE_CONFIG_CONTENT`, Antigravity via an ephemeral key
 * removed after `done`. That covers every CLI PTAH spawns and no CLI the USER
 * launches, which is the whole gap: `codex` in a terminal saw `node_repl` and
 * nothing else while Ptah was running beside it.
 *
 * A slot is one (target, config file) pair. `CodeExecutionMCP` owns the `ptah`
 * key in every slot for as long as its HTTP server is up, and gives all of them
 * back when it stops — so a config file never advertises a dead port.
 *
 * ## Scope, per target, measured rather than assumed
 *
 * | Target      | File                               | Scope     | Gated on detection |
 * | ----------- | ---------------------------------- | --------- | ------------------ |
 * | claude      | `{ws}/.mcp.json`                   | workspace | no                 |
 * | cursor      | `{ws}/.cursor/mcp.json`            | workspace | yes                |
 * | codex       | `{ws}/.codex/config.toml`          | workspace | yes, if TRUSTED    |
 * | codex       | `~/.codex/config.toml`             | home      | yes, if UNTRUSTED  |
 *
 * Workspace scope is preferred wherever it exists, because a home-global entry
 * is a change to a tool in every project on the machine.
 *
 * **Codex is workspace-scoped, and the CLI's own surfaces hide that.** `codex
 * --help` and `codex doctor` name only `~/.codex/config.toml`, and `codex mcp
 * add` has no scope flag — which is exactly why an earlier version of this file
 * claimed home-only. Codex's documentation says otherwise ("edit
 * `~/.codex/config.toml` or a project-scoped `.codex/config.toml`"), and the
 * probe agrees: with `{ws}/.codex/config.toml` present, `codex doctor` in that
 * workspace went from `MCP servers 1` to `2` and `codex mcp list` printed the
 * project server alongside the home one. The two files MERGE, so writing the
 * project one disturbs nothing the user set globally. Workspace scope is also
 * the only scope that can be RIGHT here: Ptah's server is one port per Ptah
 * process, and two windows open on two folders cannot share one home entry.
 *
 * **A project-scoped Codex config is honoured only for a TRUSTED project, so
 * the scope is CHOSEN per workspace rather than fixed.** The same probe in a
 * fresh `git init` temp repo with no `[projects.'<path>'] trust_level =
 * "trusted"` entry reported `MCP servers 1` — the file was ignored, silently.
 * `codexProjectTrusted` reads that record, and an untrusted workspace gets the
 * HOME config instead, which Codex reads unconditionally.
 *
 * That is self-healing in the right direction: the untrusted workspace works on
 * the user's first `codex` run, that run is what raises the trust prompt, and
 * the next registration pass moves the entry to the workspace file and drops
 * the home one. Ptah never writes a trust entry itself — trust grants Codex the
 * right to run commands in a directory, and answering that for the user would
 * be Ptah settling a security question that was asked of them.
 *
 * The cost is one case: two UNTRUSTED workspaces open at once share the single
 * home entry, so the last registration wins. An untrusted workspace is one the
 * user has not yet run Codex in, which makes that both rare and transient.
 *
 * ## Antigravity is retired, not absent (TASK_2026_2297)
 *
 * Ptah used to keep a persistent entry in `~/.gemini/config/mcp_config.json`
 * (read by the `agy` CLI) and in `{ws}/.agents/mcp_config.json` (read by the
 * Antigravity editor). It no longer plans either slot: an `agy` session Ptah
 * spawns gets the server per session (`ptah_lane` in ACP `session/new`, or the
 * stream-json lane's own entry), and a home-global file must not carry a
 * long-lived Ptah credential. `retired-ptah-mcp-slots.ts` removes the entries
 * an earlier Ptah wrote. An `agy` run from a terminal gets no Ptah tools.
 *
 * ## Copilot is deliberately absent, and that is not a gap
 *
 * `copilot mcp --help` lists three sources: user `~/.copilot/mcp-config.json`,
 * **workspace `.mcp.json` or `.github/mcp.json`**, and plugins. Copilot
 * therefore already reads the file Ptah writes for Claude — verified with
 * `copilot mcp list`, which prints `Workspace servers: ptah (http)` with no
 * Copilot-specific file on disk. Writing `~/.copilot/mcp-config.json` as well
 * would declare the same server twice, in every project, one of them global.
 * (`mcp-facet.registry.ts` still calls Copilot home-only. That is right for a
 * USER-installed server, which the reconciler fans out per install target; it
 * is wrong as a description of what Copilot can read.)
 *
 * ## VS Code is absent for a different reason
 *
 * `{ws}/.vscode/mcp.json` is a real facet and a real surface, but VS Code is an
 * EDITOR whose MCP servers the user manages through its own UI, not one of the
 * CLI agents this exists to reach — and Ptah already serves the VS Code host
 * in-process. Adding the slot would create a file in the user's repository for
 * a consumer that did not ask for one. Adding `'vscode'` to
 * {@link WORKSPACE_TARGETS} is all it would take if that changes.
 *
 * ## Why every target but `claude` is gated on detection
 *
 * Writing `{ws}/.codex/config.toml` or `{ws}/.cursor/mcp.json` for a user who
 * runs neither adds files to their repository, and writing
 * `~/.codex/config.toml` on a machine with no Codex CREATES that file. None is
 * a config the tool would otherwise have.
 * `claude` is the exception because it is not one consumer: `.mcp.json` is read
 * by Claude Code, by Copilot CLI and by `ptah-cli`, so "is Claude installed" is
 * the wrong question to gate it on — and it has always been written
 * unconditionally, so gating it now would be a silent removal.
 */

import type { HarnessTargetId, McpHttpConfig } from '@ptah-extension/shared';
import {
  codexProjectTrusted,
  createMcpFacet,
  CodexTomlMcpFacet,
  type IHarnessMcpFacet,
} from '@ptah-extension/harness-sync';

/** One config file Ptah declares its own server in. */
export interface PtahMcpSlot {
  readonly target: HarnessTargetId;
  readonly facet: IHarnessMcpFacet;
  /** The root the facet resolves against. Empty for a home-scoped facet. */
  readonly workspaceRoot: string;
  /** Absolute path of the config file. Identifies the slot. */
  readonly configPath: string;
}

/**
 * The one target written without asking whether its CLI is installed, and the
 * one whose entry is NOT written through a facet.
 *
 * Both exceptions have the same root: `{ws}/.mcp.json` predates this module,
 * is read by three different tools, and already holds a `{ type, url }` entry
 * in every user's repository. See `CodeExecutionMCP.writeMcpJsonEntry`.
 */
export const CLAUDE_TARGET: HarnessTargetId = 'claude';

/** One config file Ptah declares into: a target plus the scope of its file. */
interface SlotSpec {
  readonly target: HarnessTargetId;
  readonly scope: 'workspace' | 'home';
  /**
   * When present, the spec is planned only for the roots this returns true for.
   * Codex is the one target whose scope depends on the workspace rather than on
   * the tool, so the two Codex specs are mutually exclusive per root.
   */
  readonly appliesTo?: (workspaceRoot: string, homeDir?: string) => boolean;
}

/**
 * Every slot, in a stable order. A target may appear twice when its scope
 * depends on the workspace — see the Codex note in the header. Antigravity is
 * retired; see `retired-ptah-mcp-slots.ts`.
 */
const SLOT_SPECS: readonly SlotSpec[] = [
  { target: CLAUDE_TARGET, scope: 'workspace' },
  { target: 'cursor', scope: 'workspace' },
  {
    target: 'codex',
    scope: 'workspace',
    appliesTo: (root, homeDir) =>
      codexProjectTrusted(root, homeDir === undefined ? {} : { homeDir }),
  },
  {
    target: 'codex',
    scope: 'home',
    appliesTo: (root, homeDir) =>
      !codexProjectTrusted(root, homeDir === undefined ? {} : { homeDir }),
  },
];

/**
 * The facet for one spec.
 *
 * `createMcpFacet` answers for the scope the RECONCILER wants, which is the
 * right default and not always the one wanted here: a server the user INSTALLED
 * is a machine-wide choice, while Ptah's own server is bound to one workspace's
 * Ptah process. Codex, whose scope is chosen per workspace, is where those
 * differ.
 */
function facetFor(
  spec: SlotSpec,
  options: { homeDir?: string },
): IHarnessMcpFacet {
  if (spec.target === 'codex') {
    return new CodexTomlMcpFacet({ ...options, scope: spec.scope });
  }
  return createMcpFacet(spec.target, options);
}

export interface PtahMcpSlotDeps {
  /** Every open workspace folder, plus the active root; deduplicated here. */
  workspaceRoots: readonly string[];
  /** Answers whether a rival CLI is on this machine. */
  isInstalled: (target: HarnessTargetId) => Promise<boolean>;
  /** Overridable so specs never reach the developer's real home directory. */
  homeDir?: string;
}

/**
 * The URL an external consumer calls Ptah's server on (TASK_2026_364).
 *
 * A workspace-scoped slot declares its folder in the URL, as
 * `/workspace/{encodeURIComponent(folder)}` — the same mechanism as the
 * `/session/{id}` segment Ptah's own SDK sessions already send
 * (`sdk-query-options-builder.ts`), parsed beside it in
 * `http-server.handler.ts`. A bare URL cannot say which workspace the caller
 * belongs to, so with two folders open the server answered for whichever was
 * most recently activated.
 *
 * A HOME-scoped slot (`workspaceRoot === ''`) keeps the bare URL: one home
 * file serves every open folder at once, so no single folder is the right one
 * to declare.
 *
 * `encodeURIComponent`, never hand-rolled escaping: a Windows root carries a
 * colon and backslashes, and — load-bearing for the read-back rule below —
 * the encoding turns every `/` in the folder into `%2F`, so the URL can never
 * grow a literal `/sse` out of a path segment.
 *
 * The spawn-side twin is `ptahMcpServerUrl` in
 * `cli-agent-runtime/cli-adapters/ptah-mcp-url.ts`. The two must produce the
 * same grammar; each names the other so a change to one finds both.
 */
export function ptahMcpUrl(port: number, workspaceRoot: string): string {
  const base = `http://localhost:${port}`;
  if (workspaceRoot === '') return base;
  return `${base}/workspace/${encodeURIComponent(workspaceRoot)}`;
}

/**
 * The entry to declare, identical for every target.
 *
 * `http`, and that is load-bearing rather than a simplification.
 * `configToJson` drops the discriminant for every target but VS Code, but
 * `jsonToConfig` reads the transport back from the URL (`inferTransportType`:
 * `sse` only when the URL contains `/sse`), so an entry WRITTEN as `sse` reads
 * back as `http` and the read-compare-write below would find a difference and
 * rewrite the file on every single pass. The `/workspace/...` segment keeps
 * that property — see `ptahMcpUrl` — so a scoped entry still reads back as
 * `http` and the round trip stays byte-stable.
 */
export function ptahMcpEntry(
  port: number,
  workspaceRoot: string,
): McpHttpConfig {
  return { type: 'http', url: ptahMcpUrl(port, workspaceRoot) };
}

/**
 * Resolve every slot Ptah should currently own.
 *
 * A target whose facet cannot resolve a path — a workspace-scoped facet with no
 * folder open — contributes nothing rather than a slot that fails on write.
 */
export async function planPtahMcpSlots(
  deps: PtahMcpSlotDeps,
): Promise<PtahMcpSlot[]> {
  const facetOptions =
    deps.homeDir === undefined ? {} : { homeDir: deps.homeDir };
  const roots = [...new Set(deps.workspaceRoots.filter((root) => root !== ''))];
  const slots: PtahMcpSlot[] = [];

  for (const spec of SLOT_SPECS) {
    if (
      spec.target !== CLAUDE_TARGET &&
      !(await deps.isInstalled(spec.target))
    ) {
      continue;
    }
    const facet = facetFor(spec, facetOptions);
    const applies = spec.appliesTo;

    if (spec.scope === 'home') {
      // A home file serves every open root at once, so a gated home spec is
      // planned when it applies to ANY of them. That is what makes the two
      // Codex specs cover a mixed set: the trusted roots get their own
      // workspace files, and one home entry covers the rest.
      if (applies && !roots.some((root) => applies(root, deps.homeDir))) {
        continue;
      }
      const configPath = facet.configPath('');
      if (configPath === null) continue;
      slots.push({ target: spec.target, facet, workspaceRoot: '', configPath });
      continue;
    }

    for (const workspaceRoot of roots) {
      if (applies && !applies(workspaceRoot, deps.homeDir)) continue;
      const configPath = facet.configPath(workspaceRoot);
      if (configPath === null) continue;
      slots.push({ target: spec.target, facet, workspaceRoot, configPath });
    }
  }

  return slots;
}
