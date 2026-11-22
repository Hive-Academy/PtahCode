/**
 * A chat turn as ACP prompt content: the text, each image as an `image`
 * block and each referenced file as a `resource_link` with a `file://` URI.
 * Pure; the caller checked image support (`promptCapabilities.image`).
 */
import { pathToFileURL } from 'node:url';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import type { ProviderTurnInput } from '@ptah-extension/provider-session-contracts';

/** A Windows drive (`C:\`, `C:/`) or UNC (`\\server\share`) path. */
const WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\[^\\])/;

/**
 * The `file://` URI of an absolute host path, by the path's own shape rather
 * than the host's: a Windows path (drive letter, backslashes, UNC host)
 * converts with Windows rules, a `/`-rooted one with POSIX rules, so the URI
 * is the same whatever platform built it.
 */
export function acpFileUri(path: string): string {
  return pathToFileURL(path, { windows: WINDOWS_PATH.test(path) }).href;
}

export function toAcpPromptContent(input: ProviderTurnInput): ContentBlock[] {
  const images = input.images ?? [];
  const files = input.files ?? [];
  const blocks: ContentBlock[] = [];
  // ACP needs at least one block; an attachment-only turn sends no empty text.
  if (input.text || (images.length === 0 && files.length === 0)) {
    blocks.push({ type: 'text', text: input.text });
  }
  for (const image of images) {
    blocks.push({ type: 'image', mimeType: image.mimeType, data: image.data });
  }
  for (const file of files) {
    blocks.push({ type: 'resource_link', uri: acpFileUri(file.path), name: file.name });
  }
  return blocks;
}
