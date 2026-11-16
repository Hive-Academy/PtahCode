// The host returns raw errors. Only these fixed sentences reach the UI.
export const SAVE_KEY_FAILED_MESSAGE = 'Could not save the ElevenLabs API key.';
export const CLEAR_KEY_FAILED_MESSAGE = 'Could not clear the ElevenLabs API key.';
export const SAVE_SETTINGS_FAILED_MESSAGE = 'Could not save the ElevenLabs settings.';
export const LOAD_VOICES_FAILED_MESSAGE = 'Could not load your ElevenLabs voices.';
export const VOICES_PERMISSION_HINT =
  'This key cannot list voices. Enable Voices (read) for it in ElevenLabs, or enter a voice ID.';
export const VOICES_FALLBACK_HINT = 'You can still enter a voice ID.';
export const TEST_OK_MESSAGE = 'Connection works.';
export const TEST_FAILED_MESSAGE = 'The connection test failed.';

const TEST_CATEGORY_MESSAGE: Readonly<Record<string, string>> = {
  auth: 'Authentication: ElevenLabs rejected the key.',
  quota: 'Quota: the ElevenLabs account is out of credits or rate-limited.',
  network: 'Network: could not reach ElevenLabs.',
};
const TEST_OTHER_CATEGORY_MESSAGE =
  'Provider error: ElevenLabs could not complete the test.';

export function testFailureMessage(category: string | undefined): string {
  if (!category) return TEST_FAILED_MESSAGE;
  return TEST_CATEGORY_MESSAGE[category] ?? TEST_OTHER_CATEGORY_MESSAGE;
}
