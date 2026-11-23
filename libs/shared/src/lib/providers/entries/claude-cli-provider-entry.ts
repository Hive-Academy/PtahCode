/**
 * Native Claude provider entry — uses the host's local CLI login / subscription.
 *
 * Unlike every other Anthropic-compatible provider, this one does NOT point
 * `ANTHROPIC_BASE_URL` at a third-party endpoint and does NOT carry an API key.
 * It relies entirely on the credentials the official `@anthropic-ai/claude-agent-sdk`
 * already resolves from the host (`~/.claude` login created by the Claude CLI,
 * honoring whatever subscription the user has). The spawn path produces an EMPTY
 * auth env for this provider so the subagent inherits that ambient login exactly
 * like Ptah's default conductor does — see `PtahCliRegistry.buildAuthEnv`.
 *
 * Key characteristics:
 * - `baseUrl: ''`  — never override the endpoint; the SDK defaults to the
 *   native Anthropic API reached with the host's credentials.
 * - `authType: 'none'` + `nativeAuth: true` — no key is collected or injected.
 *   Setting an auth token (even a placeholder) would override the real login.
 * - `defaultTiers` map to real Claude model ids so a spawned panelist (e.g. in
 *   a chat skill) runs a concrete model.
 * - No built-in model list: the model list is the native login's live SDK
 *   `supportedModels()`; a failed read reports the saved or unavailable list.
 */

import type { AnthropicProvider } from '../provider-registry';

export const CLAUDE_CLI_PROVIDER_ENTRY: AnthropicProvider = {
  id: 'claude-cli',
  name: 'Claude (Subscription)',
  baseUrl: '',
  authEnvVar: 'ANTHROPIC_API_KEY',
  authType: 'none',
  nativeAuth: true,
  keyPrefix: '',
  helpUrl: 'https://www.anthropic.com/claude-code',
  description: 'Use your local Claude login / subscription — no API key needed',
  keyPlaceholder: 'No API key needed',
  maskedKeyDisplay: 'Local (Claude login)',
  // The models the CLI's own `opus` / `sonnet` / `haiku` aliases resolve to
  // (SDK supportedModels(), 2026-10-07); each ID checked with `claude -p`.
  defaultTiers: {
    opus: 'claude-opus-5-5',
    sonnet: 'claude-sonnet-5-5',
    haiku: 'claude-haiku-5-5',
  },
};
