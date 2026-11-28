/**
 * Antigravity tool-size compaction (TASK_2026_2331).
 *
 * agy (Antigravity CLI, ACP) silently drops any Ptah MCP tool declaration
 * whose `name + description + JSON.stringify(inputSchema)` exceeds roughly
 * 2.1 KB — evidence: `.ptah/specs/TASK_2026_2329_7f4a/live-test-results.md`
 * on branch `fix/full-auto-yolo-providers` (live run against a real agy
 * client): tools at or below 2,124 B survived (e.g. `ptah_task_create`),
 * larger ones were silently dropped from the model's own tool list
 * (`ptah_agent_spawn` 8,679 B, `ptah_session_start` 4,981 B,
 * `ptah_route_decide` 3,473 B, `ptah_grep` 2,290 B,
 * `ptah_harness_create_skill` 2,154 B, and others). The exact
 * Antigravity/Gemini-side limit is NOT independently confirmed anywhere in
 * this repo or in agy's own docs — this budget is only set safely under the
 * largest confirmed-surviving size observed in that live test.
 */
export const ANTIGRAVITY_TOOL_DECLARATION_BUDGET = 2048;

/** The `cli` query marker Antigravity's Ptah MCP attachment is tagged with. */
export const ANTIGRAVITY_CALLER_CLI = 'antigravity';

/** The shape `compactToolsForAntigravity` needs — never widened to the full tool type. */
interface SizedToolDeclaration {
  name: string;
  description: string;
  inputSchema?: unknown;
}

/** UTF-8 byte length: the live-test evidence measured agy's limit in bytes, not UTF-16 code units. */
function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** `name + description + JSON.stringify(inputSchema)`, the size agy enforces, in bytes. */
function declarationSize(tool: SizedToolDeclaration): number {
  return (
    byteLength(tool.name) +
    byteLength(tool.description) +
    byteLength(JSON.stringify(tool.inputSchema ?? {}))
  );
}

/**
 * The first sentence or paragraph of a description, whichever is shorter —
 * a meaningful prefix rather than an arbitrary character cut. Falls back to
 * the whole description when neither a sentence end nor a blank line is
 * found (e.g. a one-line description with no terminal punctuation).
 */
function firstMeaningfulChunk(description: string): string {
  const paragraphBreak = description.indexOf('\n\n');
  const paragraph =
    paragraphBreak === -1 ? description : description.slice(0, paragraphBreak);
  const sentenceMatch = /^[\s\S]*?[.!?](?=\s|$)/.exec(paragraph);
  return sentenceMatch ? sentenceMatch[0].trimEnd() : paragraph.trimEnd();
}

/**
 * Cuts `text` to at most `maxBytes` UTF-8 bytes, always at a whole-character
 * boundary (never splitting a multi-byte sequence or a surrogate pair).
 */
function truncateToByteBudget(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (byteLength(text) <= maxBytes) return text;
  let end = text.length;
  while (end > 0 && byteLength(text.slice(0, end)) > maxBytes) {
    end -= 1;
  }
  // `end` is a UTF-16 code-unit index, which can land between the two
  // halves of a surrogate pair. A lone leading (high) surrogate encodes to
  // UTF-8's replacement character, not a byte prefix of the real character,
  // so it must be dropped entirely rather than kept.
  if (end > 0) {
    const lastUnit = text.charCodeAt(end - 1);
    if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) {
      end -= 1;
    }
  }
  return text.slice(0, end);
}

const ELLIPSIS = '…';
const ELLIPSIS_BYTES = byteLength(ELLIPSIS);

/**
 * Shortens only `description` (never `name`, never `inputSchema` — the
 * schema is required to call the tool correctly) for any tool whose
 * declaration exceeds {@link ANTIGRAVITY_TOOL_DECLARATION_BUDGET}, to the
 * first sentence/paragraph of its description. Returns a new array: a tool
 * under budget is passed through by reference, but an over-budget tool is
 * replaced with a shallow copy rather than mutated in place, because some
 * tool definitions (e.g. the lifecycle tools) are module-level singletons
 * shared by every caller and every future request — mutating one in place
 * would leak this caller's shortened description into everyone else's list.
 *
 * A tool whose `name` + `inputSchema` alone already meet or exceed the
 * budget cannot be brought under it by shortening the description (name and
 * schema are never touched); its description is reduced as far as the
 * remaining allowance permits, down to empty, and the declaration may still
 * read over budget. `ptah_route_decide` is one such tool in this repo: its
 * generated `inputSchema` alone is already close to the budget.
 */
export function compactToolsForAntigravity<T extends SizedToolDeclaration>(
  tools: readonly T[],
): T[] {
  return tools.map((tool) => {
    if (declarationSize(tool) <= ANTIGRAVITY_TOOL_DECLARATION_BUDGET) {
      return tool;
    }

    const schemaSize = byteLength(JSON.stringify(tool.inputSchema ?? {}));
    const descriptionBudget = Math.max(
      0,
      ANTIGRAVITY_TOOL_DECLARATION_BUDGET - byteLength(tool.name) - schemaSize,
    );

    let shortened = firstMeaningfulChunk(tool.description);
    if (byteLength(shortened) > descriptionBudget) {
      shortened =
        descriptionBudget > ELLIPSIS_BYTES
          ? `${truncateToByteBudget(shortened, descriptionBudget - ELLIPSIS_BYTES).trimEnd()}${ELLIPSIS}`
          : truncateToByteBudget(shortened, descriptionBudget);
    }
    return { ...tool, description: shortened };
  });
}
