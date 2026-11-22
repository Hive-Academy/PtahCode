/**
 * `ptah_grep` bounds, shared by its handler, its published schema
 * (`buildGrepTool`) and its result budget. Dependency-free on purpose.
 */
export const GREP_TOOL_NAME = 'ptah_grep';
export const GREP_DEFAULT_MAX_MATCHES = 60;
export const GREP_HARD_MAX_MATCHES = 200;
export const GREP_MAX_FILES = 40;
export const GREP_MAX_CONTEXT = 5;
/** Longest match line kept, in chars. */
export const GREP_MAX_LINE_CHARS = 200;
/** Result budget in chars. */
export const GREP_RESULT_BUDGET_CHARS = 16_000;
/** Result budget in tokens: matched code lines are about 2.7 chars/token. */
export const GREP_RESULT_BUDGET_TOKENS = 6_000;
/** Own output cap: below the budget, so the budget never cuts mid-line. */
export const GREP_MAX_CHARS = 15_000;
/** Time limit of one search, in ms. */
export const GREP_TIMEOUT_MS = 15_000;
/** Most stdout kept from a search binary (`rg`, `git grep`), in bytes. */
export const GREP_MAX_ENGINE_BYTES = 4 * 1024 * 1024;
/** Matches kept per search before grouping; the rest is only counted. */
export const GREP_COLLECT_CAP = 5_000;
/** The Node engine skips lines longer than this (minified code). */
export const GREP_MAX_SEARCHED_LINE_CHARS = 10_000;
/** Files above this size are skipped by the Node engine. */
export const GREP_MAX_FILE_BYTES = 1024 * 1024;
/** Files the Node engine visits before it stops. */
export const GREP_MAX_FILES_VISITED = 20_000;
/** Files above this size get no enclosing-symbol labels. */
export const GREP_MAX_LABEL_FILE_BYTES = 512 * 1024;
/**
 * A result this small inlines the body of each match's enclosing declaration,
 * so the caller needs no follow-up read: at most this many matches in all...
 */
export const GREP_INLINE_MAX_MATCHES = 3;
/** ...inside at most this many distinct enclosing declarations. */
export const GREP_INLINE_MAX_SYMBOLS = 2;
/** Most lines of one inlined body; a longer one is cut around its matches. */
export const GREP_INLINE_MAX_BODY_LINES = 60;
/** Most inlined body lines of one result. */
export const GREP_INLINE_MAX_TOTAL_LINES = 150;
/** Lines kept above the first match when a long body is cut. */
export const GREP_INLINE_LEAD_LINES = 3;
