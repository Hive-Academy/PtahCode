/**
 * Safe, actionable copy for a failure a wizard surface shows (TASK_2026_701_9e4b
 * B5). The raw exception or backend text never reaches the view: it can carry
 * paths, URLs, tokens or markup, and escaping alone does not redact them.
 * Known failure kinds map to fixed copy; anything else gets the caller's
 * generic fallback. Raw detail belongs only in the diagnostic log.
 */
export type FailureKind =
  | 'timeout'
  | 'offline'
  | 'permission'
  | 'disk-full'
  | 'partial'
  | 'plan-expired'
  | 'not-found'
  | 'setup-model'
  | 'unknown';

/** Patterns checked in order; the first match names the kind. */
const KIND_PATTERNS: ReadonlyArray<
  readonly [Exclude<FailureKind, 'unknown'>, RegExp]
> = [
  ['setup-model', /\bsetup_model_invalid\b/],
  ['timeout', /\btimed?[\s-]?out\b|\btimeout\b|\betimedout\b/],
  [
    'permission',
    /\beacces\b|\beperm\b|\berofs\b|permission denied|access is denied|read-only/,
  ],
  ['disk-full', /\benospc\b|no space left/],
  ['partial', /^\d+ file\(s\) failed to install$/],
  [
    'plan-expired',
    /\b(plan|preview) token\b|\bplan\b.*\b(expired|stale|missing|mismatch)/,
  ],
  [
    'offline',
    /\beconnrefused\b|\benotfound\b|\beconnreset\b|\bnetwork\b|fetch failed|\boffline\b/,
  ],
  ['not-found', /\benoent\b|\b404\b|not found/],
];

const KIND_COPY: Readonly<Record<Exclude<FailureKind, 'unknown'>, string>> = {
  'setup-model':
    'Setup model cannot run guidance. Update Background models and retry.',
  timeout: 'The request timed out. Try again.',
  permission:
    'The folder did not allow the write (permission denied). Check the folder permissions and try again.',
  'disk-full': 'The disk is full. Free some space and try again.',
  partial: 'Some files could not be installed. Retry the failed files.',
  'plan-expired':
    'The comparison is out of date. Open the install again to compare the files.',
  offline:
    'The source could not be reached. Check your connection and try again.',
  'not-found': 'A file was not found at its source. Try again later.',
};

const SETUP_REFUSAL =
  /\bsetup_model_invalid\s+reason=(provider-unknown|provider-unsupported|provider-missing|model-missing|model-stale|not-signed-in|provider-unavailable)(?:\s+provider=([a-z0-9][a-z0-9._-]{0,63}))?\b/i;
const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic',
  claude: 'Claude',
  codex: 'Codex',
  google: 'Google',
  kimi: 'Kimi',
  ollama: 'Ollama',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

function setupModelCopy(raw: string | null | undefined): string {
  const match = SETUP_REFUSAL.exec(raw ?? '');
  if (!match) return KIND_COPY['setup-model'];
  const reason = match[1].toLowerCase();
  const provider = match[2]?.toLowerCase();
  const label = provider
    ? (PROVIDER_LABELS[provider] ?? provider)
    : undefined;
  switch (reason) {
    case 'not-signed-in':
      return `Sign in to ${label ?? 'the configured provider'}. Then retry guidance.`;
    case 'model-stale':
      return `The saved model${label ? ` for ${label}` : ''} is not available. Choose another model in Settings > Background models.`;
    case 'model-missing':
      return `The Setup model${label ? ` for ${label}` : ''} is not set. Choose a model in Settings > Background models.`;
    case 'provider-missing':
      return 'The Setup provider is not set. Choose a provider and model in Settings > Background models.';
    case 'provider-unknown':
      return 'The Setup provider is not recognized. Choose a provider in Settings > Background models.';
    case 'provider-unsupported':
      return 'The Setup provider is not supported. Choose another provider in Settings > Background models.';
    case 'provider-unavailable':
      return `${label ?? 'The Setup provider'} is unavailable. Check the provider connection and retry.`;
    default:
      return KIND_COPY['setup-model'];
  }
}

/** Classify a raw failure text without exposing it. */
export function failureKind(raw: string | null | undefined): FailureKind {
  const text = (raw ?? '').trim().toLowerCase();
  if (!text) return 'unknown';
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return 'unknown';
}

/**
 * Fixed copy for the failure's kind, or `fallback` for an unknown one. The
 * return value never contains any part of `raw`.
 */
export function safeFailureCopy(
  raw: string | null | undefined,
  fallback: string,
): string {
  const kind = failureKind(raw);
  if (kind === 'setup-model') return setupModelCopy(raw);
  return kind === 'unknown' ? fallback : KIND_COPY[kind];
}
