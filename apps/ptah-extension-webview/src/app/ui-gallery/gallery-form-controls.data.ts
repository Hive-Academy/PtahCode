import type { PtahSelectOption } from '@ptah-extension/ui';

/** 16 x 16 stroke paths for the gallery icons (keys of `PtahSelectOption.icon`). */
export const GALLERY_ICON_PATHS: Readonly<Record<string, string>> = {
  cloud: 'M4.5 12.5h7a3 3 0 0 0 .4-6A4 4 0 0 0 4.2 7.6 2.5 2.5 0 0 0 4.5 12.5z',
  chip: 'M5 5h6v6H5zM7 2v3M9 2v3M7 11v3M9 11v3M2 7h3M2 9h3M11 7h3M11 9h3',
  server: 'M3 3h10v4H3zM3 9h10v4H3zM5.5 5h.01M5.5 11h.01',
  key: 'M10 2.5a3.5 3.5 0 1 1-2.9 5.4L3 12v1.5h2V12h1.5v-1.5H8l.6-.6A3.5 3.5 0 0 1 10 2.5zM11 5h.01',
  spark: 'M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2',
  bolt: 'M9 2L4 9h4l-1 5 5-7H8z',
  link: 'M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1',
  search: 'M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.5 10.5L14 14',
};

/** Providers for the connection form: two groups, one disabled option. */
export const PROVIDER_OPTIONS: readonly PtahSelectOption<string>[] = [
  { value: 'anthropic', label: 'Anthropic', description: 'Hosted API, key required', group: 'Cloud', icon: 'cloud' },
  { value: 'openai', label: 'OpenAI', description: 'Hosted API, key required', group: 'Cloud', icon: 'cloud' },
  { value: 'openrouter', label: 'OpenRouter', description: 'Many vendors, one key', group: 'Cloud', icon: 'link', keywords: ['router', 'proxy'] },
  { value: 'ollama', label: 'Ollama', description: 'Runs on this computer', group: 'Local', icon: 'chip' },
  { value: 'lmstudio', label: 'LM Studio', description: 'Runs on this computer', group: 'Local', icon: 'chip', keywords: ['lm'] },
  { value: 'gateway', label: 'Company gateway', description: 'Ask your admin to turn it on', group: 'Self-hosted', icon: 'server', disabled: true },
  { value: 'custom', label: 'Custom endpoint', description: 'Any Anthropic-compatible URL', group: 'Self-hosted', icon: 'server' },
];

/** Models: groups by tier, search on (more than 7 options). */
export const MODEL_OPTIONS: readonly PtahSelectOption<string>[] = [
  { value: 'opus', label: 'Opus', description: 'Deep work and long plans', group: 'Most capable', icon: 'spark' },
  { value: 'fable', label: 'Fable', description: 'Long stories and drafts', group: 'Most capable', icon: 'spark' },
  { value: 'sonnet', label: 'Sonnet', description: 'Balanced speed and depth', group: 'Balanced', icon: 'bolt' },
  { value: 'gpt-large', label: 'GPT large', description: 'General work', group: 'Balanced', icon: 'bolt' },
  { value: 'mistral', label: 'Mistral medium', description: 'Open weights', group: 'Balanced', icon: 'bolt' },
  { value: 'haiku', label: 'Haiku', description: 'Fast answers', group: 'Fast', icon: 'chip' },
  { value: 'gpt-mini', label: 'GPT mini', description: 'Fast answers', group: 'Fast', icon: 'chip' },
  { value: 'llama', label: 'Llama 8B', description: 'Local, small', group: 'Fast', icon: 'chip', keywords: ['local'] },
  { value: 'retired', label: 'Legacy model', description: 'Retired. Select a new model.', group: 'Fast', icon: 'chip', disabled: true },
];

/** Page sizes: a short list, so the rich select shows no search. */
export const PAGE_SIZE_OPTIONS: readonly PtahSelectOption<number>[] = [
  { value: 25, label: '25 rows' },
  { value: 50, label: '50 rows' },
  { value: 100, label: '100 rows' },
];

/** Sort orders for a toolbar sort slot. */
export const SORT_OPTIONS: readonly PtahSelectOption<string>[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

/** Connected repositories for the Fields demo. */
export const REPOSITORY_OPTIONS: readonly PtahSelectOption<string>[] = [
  { value: 'org/api', label: 'org/api' },
  { value: 'org/web', label: 'org/web' },
];

/** A short list without groups or icons: search stays off. */
export const REGION_OPTIONS: readonly PtahSelectOption<string>[] = [
  { value: 'us', label: 'United States' },
  { value: 'eu', label: 'European Union' },
  { value: 'apac', label: 'Asia Pacific' },
];
