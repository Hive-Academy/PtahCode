import { InjectionToken, computed, inject, type Signal } from '@angular/core';
import {
  AuthStateService,
  CLAUDE_CODE_INSTALL_COMMANDS,
  CLAUDE_CODE_SETUP_DOCS_URL,
  CODEX_INSTALL_COMMANDS,
  CODEX_SETUP_DOCS_URL,
  type ClaudeCodeInstallCommand,
} from '@ptah-extension/core';
import type {
  ProviderSessionAuthStatus,
  ProviderSessionProfileId,
} from '@ptah-extension/shared';
import { Code, Orbit, Terminal, type LucideIconData } from 'lucide-angular';
import type { ProviderKind } from './provider-readiness.derive';

/** One copyable install command inside an install guide. */
export interface ConnectionInstallCommand {
  readonly id: string;
  /** The tab the command is listed under. */
  readonly tab: string;
  /** Who the command is for, shown above it. */
  readonly label: string;
  readonly command: string;
  /** The Copy button's accessible name. */
  readonly copyLabel: string;
}

/** What the "How to install" dialog shows for one provider. */
export interface ConnectionInstallGuide {
  readonly title: string;
  readonly intro: string;
  /** Accessible name of the tab list. */
  readonly tablistLabel: string;
  readonly tabs: readonly { readonly id: string; readonly label: string }[];
  readonly commands: readonly ConnectionInstallCommand[];
  readonly docsUrl: string;
  readonly docsLabel: string;
}

/**
 * One main-connection choice on the Get ready step. The radio cards and the
 * detail cards are both built from {@link CONNECTION_OPTIONS}, so adding a
 * provider means adding one descriptor here.
 */
export interface ConnectionOption {
  readonly id: ProviderKind;
  readonly name: string;
  /** One line under the name, the same on the radio card and the detail card. */
  readonly description: string;
  /** The terminal command Ptah looks for. */
  readonly commandName: string;
  readonly icon: LucideIconData;
  /** `data-testid` of the detail card. */
  readonly panelTestId: string;
  readonly install: ConnectionInstallGuide;
  /**
   * The provider-session profile behind this option. Such an option is listed
   * only while the host reports a status row for the profile.
   */
  readonly providerSession?: ProviderSessionProfileId;
}

/** Whether a card is the saved main connection, another option, or neither is known. */
export type ConnectionRole = 'main' | 'information' | 'neutral';

const CLAUDE_COPY_LABELS: Record<ClaudeCodeInstallCommand['id'], string> = {
  unix: 'Copy macOS and Linux install command',
  powershell: 'Copy Windows PowerShell install command',
  cmd: 'Copy Windows CMD install command',
  npm: 'Copy npm install command',
};

/** The main-connection choices, in display order. */
export const CONNECTION_OPTIONS: readonly ConnectionOption[] = [
  {
    id: 'claude-cli',
    name: 'Claude Code',
    description: "Anthropic's coding agent",
    commandName: 'claude',
    icon: Terminal,
    panelTestId: 'ready-claude-panel',
    install: {
      title: 'Install Claude Code',
      intro:
        'Open a terminal, paste the command for your system, press Enter. The installer prints nothing while it downloads. When the prompt returns, press Re-check.',
      tablistLabel: 'Operating system',
      tabs: [
        { id: 'unix', label: 'macOS / Linux' },
        { id: 'windows', label: 'Windows' },
        { id: 'npm', label: 'npm' },
      ],
      commands: CLAUDE_CODE_INSTALL_COMMANDS.map((row) => ({
        ...row,
        copyLabel: CLAUDE_COPY_LABELS[row.id],
      })),
      docsUrl: CLAUDE_CODE_SETUP_DOCS_URL,
      docsLabel: 'Open the official install guide',
    },
  },
  {
    id: 'openai-codex',
    name: 'Codex',
    description: "OpenAI's coding agent",
    commandName: 'codex',
    icon: Code,
    panelTestId: 'ready-codex-panel',
    install: {
      title: 'Install Codex',
      intro:
        'Open a terminal, paste the command for the tool you use, press Enter. When the prompt returns, press Re-check.',
      tablistLabel: 'Install method for Codex',
      tabs: [
        { id: 'npm', label: 'npm' },
        { id: 'brew', label: 'Homebrew' },
      ],
      commands: CODEX_INSTALL_COMMANDS.map((row) => ({
        ...row,
        copyLabel: `Copy ${row.label} install command`,
      })),
      docsUrl: CODEX_SETUP_DOCS_URL,
      docsLabel: 'Open the official Codex install guide',
    },
  },
];

/** Antigravity CLI installers, from https://antigravity.google/docs/install/. */
export const ANTIGRAVITY_INSTALL_COMMANDS: readonly ConnectionInstallCommand[] = [
  {
    id: 'unix',
    tab: 'unix',
    label: 'macOS and Linux',
    command: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    copyLabel: 'Copy macOS and Linux install command',
  },
  {
    id: 'powershell',
    tab: 'windows',
    label: 'Windows PowerShell',
    command: 'irm https://antigravity.google/cli/install.ps1 | iex',
    copyLabel: 'Copy Windows PowerShell install command',
  },
  {
    id: 'sign-in',
    tab: 'sign-in',
    label: 'Run once in a terminal and follow the prompts',
    command: 'agy',
    copyLabel: 'Copy Antigravity sign-in command',
  },
];

export const ANTIGRAVITY_SETUP_DOCS_URL = 'https://antigravity.google/docs/install/';

/**
 * Provider-session choices, each listed only while the host reports its
 * profile (`auth:getAuthStatus` `providerSessionStatus`).
 */
export const PROVIDER_SESSION_CONNECTION_OPTIONS: readonly ConnectionOption[] = [
  {
    id: 'antigravity-cli',
    name: 'Antigravity',
    description: "Google's coding agent",
    commandName: 'agy',
    icon: Orbit,
    panelTestId: 'ready-antigravity-panel',
    providerSession: 'antigravity',
    install: {
      title: 'Install Antigravity',
      intro:
        'Open a terminal, paste the command for your system, press Enter. Then run agy once to sign in with your Google account. When the prompt returns, press Re-check.',
      tablistLabel: 'Install steps for Antigravity',
      tabs: [
        { id: 'unix', label: 'macOS / Linux' },
        { id: 'windows', label: 'Windows' },
        { id: 'sign-in', label: 'Sign in' },
      ],
      commands: ANTIGRAVITY_INSTALL_COMMANDS,
      docsUrl: ANTIGRAVITY_SETUP_DOCS_URL,
      docsLabel: 'Open the official Antigravity install guide',
    },
  },
];

const ALL_CONNECTION_OPTIONS: readonly ConnectionOption[] = [
  ...CONNECTION_OPTIONS,
  ...PROVIDER_SESSION_CONNECTION_OPTIONS,
];

/** The descriptor for a provider; every {@link ProviderKind} has one. */
export function connectionOption(id: ProviderKind): ConnectionOption {
  const option = ALL_CONNECTION_OPTIONS.find((entry) => entry.id === id);
  if (!option) throw new Error(`No connection option for ${id}`);
  return option;
}

/** True when `kind` names one of the options. */
export function isConnectionOptionId(kind: string): kind is ProviderKind {
  return ALL_CONNECTION_OPTIONS.some((entry) => entry.id === kind);
}

/**
 * The options this host offers: every fixed option, then each
 * provider-session option whose profile has a status row.
 */
export function offeredConnectionOptions(
  rows: Partial<Record<ProviderSessionProfileId, ProviderSessionAuthStatus>>,
): readonly ConnectionOption[] {
  return [
    ...CONNECTION_OPTIONS,
    ...PROVIDER_SESSION_CONNECTION_OPTIONS.filter(
      (option) => option.providerSession && rows[option.providerSession],
    ),
  ];
}

/** The card role of `id` given the provider of the saved main connection. */
export function connectionRole(
  mainProvider: ProviderKind | null,
  id: ProviderKind,
): ConnectionRole {
  return mainProvider === id
    ? 'main'
    : mainProvider === null
      ? 'neutral'
      : 'information';
}

/**
 * The option list the Get ready step renders. Components inject it rather
 * than importing the constant, so a spec can render a longer list. It follows
 * the host's provider-session rows, so a profile the host does not report has
 * no card.
 */
export const CONNECTION_OPTION_LIST = new InjectionToken<
  Signal<readonly ConnectionOption[]>
>('CONNECTION_OPTION_LIST', {
  providedIn: 'root',
  factory: () => {
    const auth = inject(AuthStateService);
    return computed(() =>
      offeredConnectionOptions(auth.providerSessionStatus()),
    );
  },
});

/** The most connection cards shown side by side. */
export const MAX_CONNECTION_COLUMNS = 3;

/** The `--connection-cols` value for a list of `count` options. */
export function connectionColumns(count: number): number {
  return Math.max(1, Math.min(count, MAX_CONNECTION_COLUMNS));
}
