/**
 * The caller's MCP attachments as ACP `McpServer` entries: `http` (the
 * default) and `sse` keep their URL and headers, `stdio` its command, args
 * and env. Every value is secret-bearing (a bearer header, an env token), so
 * nothing here logs.
 */
import type { McpServer } from '@agentclientprotocol/sdk';
import type { ProviderMcpAttachment } from '@ptah-extension/provider-session-contracts';

/** One attachment as an ACP entry; `name` overrides the attachment's own name. */
export function toAcpMcpServer(
  attachment: ProviderMcpAttachment,
  name: string = attachment.name,
): McpServer {
  if (attachment.type === 'stdio') {
    return {
      name,
      command: attachment.command,
      args: [...attachment.args],
      env: attachment.env.map((entry) => ({ name: entry.name, value: entry.value })),
    };
  }
  return {
    type: attachment.type ?? 'http',
    name,
    url: attachment.url,
    headers: attachment.headers.map((header) => ({
      name: header.name,
      value: header.value,
    })),
  };
}
