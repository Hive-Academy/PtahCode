import { compilePtahUiBlock } from '../../mcp-apps-contracts/ptah-ui-pipeline';
import { parseContextOutput } from './context-output.parser';
import { renderContextPtahUi } from './context-output.render';
import { fitsPtahUiLimits, ptahUiFence } from './ptah-ui-writer';
import { parseUsageOutput } from './usage-output.parser';
import { renderUsagePtahUi } from './usage-output.render';

function renderBody(
  text: string,
  command?: 'context' | 'usage',
): string | null {
  const context = command === 'usage' ? null : parseContextOutput(text);
  if (context) return renderContextPtahUi(context);
  const usage = command === 'context' ? null : parseUsageOutput(text);
  if (usage) return renderUsagePtahUi(usage);
  return null;
}

/**
 * Turns the stdout of Claude Code `/usage` or `/context` into markdown holding
 * one inline ```ptah-ui dashboard block. Any other text — or a report that
 * cannot be parsed or would exceed the block limits — is returned unchanged.
 * Pure and never throws, so callers can apply it to every command's output.
 */
export function formatLocalCommandOutput(
  text: string,
  command?: 'context' | 'usage',
): string {
  if (typeof text !== 'string' || !text.trim()) return text;
  try {
    const body = renderBody(text, command);
    return body &&
      fitsPtahUiLimits(body) &&
      compilePtahUiBlock(body, 'local-command').ok
      ? ptahUiFence(body)
      : text;
  } catch {
    // A parser defect must not lose the user's command output: the raw text
    // is exactly what the chat showed before this formatter existed.
    return text;
  }
}
