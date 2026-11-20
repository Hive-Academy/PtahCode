import type { RpcUserErrorCode } from '@ptah-extension/shared';

export type BotDomainCode = Extract<
  RpcUserErrorCode,
  | `BOT_${string}`
  | 'PERSISTENCE_UNAVAILABLE'
  | 'INVALID_PARAMS'
  | 'UNAUTHORIZED_WORKSPACE'
>;
const BOT_MESSAGES = {
  BOT_NOT_FOUND: 'This bot no longer exists. Refresh the list.',
  BOT_REVISION_CONFLICT:
    'A newer revision exists. Compare it with your changes.',
  BOT_ARCHIVED: 'Restore this archived bot before editing it.',
  BOT_SCHEMA_UNSUPPORTED: 'This bot uses an unsupported format. Update Ptah.',
  BOT_SOURCE_INVALID:
    'The source is unavailable or invalid. Choose another source.',
  BOT_RETENTION_UNAVAILABLE:
    'Retention services are unavailable. Retry later or archive the bot.',
  BOT_ACTIVE_WORK: 'This bot has active work. Wait for it to finish.',
  PERSISTENCE_UNAVAILABLE:
    'Bot storage is unavailable. Retry when storage is ready.',
  INVALID_PARAMS: 'Check the bot fields and try again.',
  UNAUTHORIZED_WORKSPACE:
    'Choose an open workspace for the bot and its memory. Bot scope cannot be moved.',
} satisfies Record<BotDomainCode, string>;
export function botErrorMessage(code?: string): string {
  return code && Object.hasOwn(BOT_MESSAGES, code)
    ? BOT_MESSAGES[code as BotDomainCode]
    : 'The bot request failed. Your changes are still here. Retry the request.';
}
export interface BotFailure {
  readonly code?: string;
  readonly message: string;
}
export function avatarErrorMessage(
  code: string | undefined,
  operation: 'upload' | 'load',
): string {
  if (code === 'INVALID_PARAMS' && operation === 'upload')
    return 'Choose a PNG, JPEG or WebP up to 2 MB and retry the upload.';
  if (code === 'BOT_NOT_FOUND')
    return 'The avatar image is missing. Choose a replacement image.';
  const message =
    code && Object.hasOwn(BOT_MESSAGES, code)
      ? botErrorMessage(code)
      : 'The avatar request failed.';
  return `${message} Retry the avatar ${operation} or choose a replacement image.`;
}

export function listErrorMessage(code?: string): string {
  return code && Object.hasOwn(BOT_MESSAGES, code)
    ? botErrorMessage(code)
    : 'Could not refresh the bot list. Retry loading bots.';
}
