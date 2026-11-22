/**
 * The disclosure for a `provider:listModels` answer that serves the last saved
 * live list (`source: 'persisted'`) instead of a live one. Every surface that
 * lists models from {@link ProviderModelsLoader} shows this sentence, so a user
 * never picks from a saved list as if it were live.
 *
 * @module native/provider-model-picker
 */
import type { ProviderListModelsResult } from '@ptah-extension/shared';

/** Shown for a saved (`persisted`) list when the host sent no usable notice text. */
export const SAVED_LIST_NOTICE =
  'Showing the saved model list. The live list could not be loaded.';

/** Multi-line or banner text from a CLI probe. A short status sentence stays. */
export function isProcessDump(value: string): boolean {
  return value.includes('\n') || value.includes('\r') || value.length > 180;
}

/**
 * The notice to show for a list answer: the host's sentence, or the fixed one
 * when it is missing or a dump. `null` for a live list, and for an answer that
 * carries an error (`unavailable`), which each surface reports as its error.
 */
export function savedModelListNotice(
  result: Pick<ProviderListModelsResult, 'source' | 'notice' | 'error'>,
): string | null {
  if (result.error || result.source !== 'persisted') return null;
  const line = result.notice?.trim() ?? '';
  return !line || isProcessDump(line) ? SAVED_LIST_NOTICE : line;
}
