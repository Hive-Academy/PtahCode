/**
 * `ptah_read_symbol` bounds, shared by its handler, its published schema
 * (`buildReadSymbolTool`) and its result budget. Dependency-free on purpose:
 * the tool-definition builder imports it without the handler's stack.
 */
export const READ_SYMBOL_TOOL_NAME = 'ptah_read_symbol';
export const READ_SYMBOL_DEFAULT_MAX_LINES = 200;
export const READ_SYMBOL_HARD_MAX_LINES = 400;
/** Result budget in chars. */
export const READ_SYMBOL_RESULT_BUDGET_CHARS = 16_000;
/** Result budget in tokens: numbered code is about 2.7 chars/token, not 4. */
export const READ_SYMBOL_RESULT_BUDGET_TOKENS = 6_000;
/** Own output cap: below the budget, so the budget never cuts mid-line. */
export const READ_SYMBOL_MAX_CHARS = 15_000;
/** Files above this size are refused rather than read into memory. */
export const READ_SYMBOL_MAX_FILE_BYTES = 5 * 1024 * 1024;
