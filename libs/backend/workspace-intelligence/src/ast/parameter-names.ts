/**
 * Parameter names from the text of a parameter list (TASK_2026_2299).
 *
 * The capture of a parameter list is its source text, which may hold
 * comments, decorators, modifiers, generic arguments, destructuring and
 * default values. Splitting that text on every comma yielded fragments such
 * as `/**`, `{` or `@inject(TOKEN)` for a decorated constructor. This scanner
 * splits only on commas outside strings, comments and brackets, removes
 * comments, decorators and attributes, cuts default values, and then reads
 * the name of each parameter by the rule of its language family:
 *
 * - Name first (TS/JS, Python, Go, Rust, Ruby, Kotlin): the leading name.
 *   `...rest`, `*args`, `**kw` keep their prefix (Ruby also `&blk`); a
 *   destructuring pattern becomes `{a,b}` / `[a,b]` (`{…}` when long); a TS
 *   `this` parameter and Python's bare `*` and `/` markers are dropped.
 * - Type first (Java, C#, C/C++): the last name outside generic arguments
 *   (`Func<Invoice, T> selector` → `selector`); a parameter with a type only
 *   keeps that type, as an unnamed C parameter (`int`) has nothing else.
 * - PHP: the `$name` variable (`...$xs` when variadic).
 */

import type { SupportedLanguage } from './ast.types';

const TYPE_FIRST: ReadonlySet<SupportedLanguage> = new Set([
  'java',
  'csharp',
  'cpp',
]);

/** Languages whose line comments start with `#`. */
const HASH_COMMENTS: ReadonlySet<SupportedLanguage> = new Set([
  'python',
  'ruby',
  'php',
]);

/** Languages where `//` is not a comment (Python floor division). */
const NO_SLASH_COMMENTS: ReadonlySet<SupportedLanguage> = new Set([
  'python',
  'ruby',
]);

const TS_MODIFIERS = [
  'public',
  'private',
  'protected',
  'readonly',
  'override',
] as const;

/** Leading words that qualify a parameter but are not its name or type. */
const MODIFIERS: Partial<Record<SupportedLanguage, readonly string[]>> = {
  typescript: TS_MODIFIERS,
  tsx: TS_MODIFIERS,
  javascript: TS_MODIFIERS,
  kotlin: [
    'val',
    'var',
    'vararg',
    'private',
    'public',
    'protected',
    'internal',
    'override',
    'open',
    'final',
    'crossinline',
    'noinline',
  ],
  java: ['final'],
  csharp: ['this', 'params', 'ref', 'out', 'in', 'scoped', 'readonly'],
  php: ['public', 'private', 'protected', 'readonly'],
  rust: ['mut'],
};

/** Longest destructuring pattern written out; a longer one is `{…}`. */
const MAX_PATTERN_CHARS = 40;

const NAME = /^[\p{L}\p{N}_$]+/u;
const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
const OPENERS: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
};
const CLOSERS = new Set([')', ']', '}']);

/**
 * The parameter names of a parameter list's source text. The list's own
 * parentheses are optional (a Ruby method may omit them).
 */
export function extractParameterNames(
  paramsText: string,
  language?: SupportedLanguage,
): string[] {
  const text = stripComments(paramsText, language).trim();
  const inner = unwrap(text, '(', language).trim();
  if (!inner) return [];
  const names: string[] = [];
  for (const segment of splitTopLevel(inner, language)) {
    const name = parameterName(segment, language);
    if (name !== undefined) names.push(name);
  }
  return names;
}

function parameterName(
  segment: string,
  language: SupportedLanguage | undefined,
): string | undefined {
  let text = stripAttributes(segment.trim(), language).trim();
  text = cutDefault(text, language).trim();
  text = stripModifiers(text, language);
  if (!text) return undefined;
  if (language === 'php') return phpName(text, language);
  if (language !== undefined && TYPE_FIRST.has(language)) {
    return typeFirstName(text, language);
  }
  return nameFirstName(text, language);
}

function nameFirstName(
  text: string,
  language: SupportedLanguage | undefined,
): string | undefined {
  let rest = text;
  let prefix = '';
  const spread = /^(\.\.\.|\*\*|\*|&)\s*/.exec(rest);
  if (spread) {
    rest = rest.slice(spread[0].length);
    // Rust `&self` / `&mut self` / `&'a self`: the borrow is not the name.
    prefix = spread[1] === '&' && language !== 'ruby' ? '' : spread[1];
  }
  if (language === 'rust') {
    rest = rest.replace(/^'\w+\s+/, '').replace(/^mut\s+/, '');
  }
  const first = rest.charAt(0);
  if (first in OPENERS) {
    return prefix + patternName(rest, first, language);
  }
  const name = NAME.exec(rest)?.[0];
  if (!name) return undefined;
  const isTsLike =
    language === 'typescript' ||
    language === 'tsx' ||
    language === 'javascript';
  if (isTsLike && name === 'this' && !prefix) return undefined;
  return prefix + name;
}

/** `{a, b: c, ...d}: T` → `{a,b,...d}`; `{…}` when the names are long. */
function patternName(
  text: string,
  open: string,
  language: SupportedLanguage | undefined,
): string {
  const close = OPENERS[open];
  const end = matchingClose(text, 0, language);
  const body = text.slice(1, end < 0 ? text.length : end);
  const names = splitTopLevel(body, language)
    .map((part) => {
      const trimmed = cutDefault(part.trim(), language).trim();
      const spread = trimmed.startsWith('...') ? '...' : '';
      const rest = trimmed.slice(spread.length).trimStart();
      if (rest.charAt(0) in OPENERS) {
        return spread + patternName(rest, rest.charAt(0), language);
      }
      const name = NAME.exec(rest)?.[0];
      return name ? spread + name : '';
    })
    .filter(Boolean);
  const written = `${open}${names.join(',')}${close}`;
  return written.length > MAX_PATTERN_CHARS ? `${open}…${close}` : written;
}

function typeFirstName(
  text: string,
  language: SupportedLanguage,
): string | undefined {
  if (text === '...') return '...';
  // C function pointer `int (*fn)(int)`.
  const pointer = /\(\s*[*&^]+\s*([\p{L}_][\p{L}\p{N}_]*)\s*\)/u.exec(text);
  if (pointer) return pointer[1];
  const withoutArrays = text.replace(/(\s*\[[^\]]*\])+$/, '');
  const topLevel = topLevelText(withoutArrays, language);
  const identifiers = topLevel.match(IDENTIFIER) ?? [];
  const name = identifiers[identifiers.length - 1];
  if (name === undefined) return undefined;
  const variadic = identifiers.length > 1 && topLevel.includes('...');
  return variadic ? `...${name}` : name;
}

function phpName(text: string, language: SupportedLanguage): string | undefined {
  const variable = /(\.\.\.)?\s*&?\s*(\$[\p{L}\p{N}_]+)/u.exec(text);
  if (variable) return `${variable[1] ?? ''}${variable[2]}`;
  return nameFirstName(text, language);
}

function stripModifiers(
  text: string,
  language: SupportedLanguage | undefined,
): string {
  const modifiers = language === undefined ? undefined : MODIFIERS[language];
  if (!modifiers) return text;
  let rest = text;
  for (;;) {
    const word = /^([\p{L}_]+)\s+(?=\S)/u.exec(rest);
    if (!word || !modifiers.includes(word[1])) return rest;
    rest = rest.slice(word[0].length);
  }
}

/**
 * Removes decorators (`@x`, `@x.y(...)`, Kotlin `@field:X(...)`), PHP and
 * Rust attributes (`#[...]`) and leading C# attributes (`[FromBody]`).
 */
function stripAttributes(
  text: string,
  language: SupportedLanguage | undefined,
): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isQuote(ch, text, i, language)) {
      const end = stringEnd(text, i);
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '@') {
      let j = i + 1;
      while (j < text.length && /[\p{L}\p{N}_$.:]/u.test(text[j])) j++;
      if (text[j] === '(') {
        const close = matchingClose(text, j, language);
        j = close < 0 ? text.length : close + 1;
      }
      out += ' ';
      i = j;
      continue;
    }
    if (ch === '#' && text[i + 1] === '[') {
      const close = matchingClose(text, i + 1, language);
      out += ' ';
      i = close < 0 ? text.length : close + 1;
      continue;
    }
    if (ch === '[' && language === 'csharp' && out.trim() === '') {
      const close = matchingClose(text, i, language);
      out += ' ';
      i = close < 0 ? text.length : close + 1;
      continue;
    }
    if (ch in OPENERS) {
      const close = matchingClose(text, i, language);
      const end = close < 0 ? text.length : close + 1;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** The text before the first top-level `=` that assigns a default. */
function cutDefault(
  text: string,
  language: SupportedLanguage | undefined,
): string {
  let cut = text.length;
  scan(text, language, (i, depth) => {
    if (depth !== 0 || text[i] !== '=') return false;
    const next = text[i + 1];
    const prev = text[i - 1];
    if (next === '=' || next === '>') return false;
    if (prev === '=' || prev === '!' || prev === '<' || prev === '>') {
      return false;
    }
    cut = i;
    return true;
  });
  return text.slice(0, cut);
}

/** The text with everything inside brackets and generic arguments removed. */
function topLevelText(
  text: string,
  language: SupportedLanguage | undefined,
): string {
  let out = '';
  scan(text, language, (i, depth) => {
    out += depth === 0 ? text[i] : ' ';
    return false;
  });
  return out;
}

/** Splits `text` on commas outside strings and brackets. */
function splitTopLevel(
  text: string,
  language: SupportedLanguage | undefined,
): string[] {
  const parts: string[] = [];
  let start = 0;
  scan(text, language, (i, depth) => {
    if (depth === 0 && text[i] === ',') {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    return false;
  });
  parts.push(text.slice(start));
  return parts.filter((part) => part.trim() !== '');
}

/** `text` without its outer `open`…close pair, when that pair spans it. */
function unwrap(
  text: string,
  open: string,
  language: SupportedLanguage | undefined,
): string {
  if (!text.startsWith(open)) return text;
  return matchingClose(text, 0, language) === text.length - 1
    ? text.slice(1, -1)
    : text;
}

/** Index of the bracket closing the one at `openIndex`, or -1. */
function matchingClose(
  text: string,
  openIndex: number,
  language: SupportedLanguage | undefined,
): number {
  let found = -1;
  const sub = text.slice(openIndex);
  scan(sub, language, (i, depth) => {
    if (i > 0 && depth === 0 && CLOSERS.has(sub[i])) {
      found = openIndex + i;
      return true;
    }
    return false;
  });
  return found;
}

/**
 * Calls `visit(index, depth)` for each char outside string literals, `depth`
 * being the bracket depth before a closer at `index` is applied and after an
 * opener is (an opener and its closer both report the outer depth). Generic
 * arguments count as brackets: `<` right after a name opens one, and `>`
 * closes it unless it is part of `=>` or `->`. Stops when `visit` returns
 * true. The text is expected to be free of comments.
 */
function scan(
  text: string,
  language: SupportedLanguage | undefined,
  visit: (index: number, depth: number) => boolean,
): void {
  const stack: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isQuote(ch, text, i, language)) {
      i = stringEnd(text, i);
      continue;
    }
    if (ch in OPENERS || (ch === '<' && opensGeneric(text, i))) {
      if (visit(i, stack.length)) return;
      stack.push(ch);
      i++;
      continue;
    }
    if (ch === '>' && stack[stack.length - 1] === '<' && !isArrow(text, i)) {
      stack.pop();
      if (visit(i, stack.length)) return;
      i++;
      continue;
    }
    if (CLOSERS.has(ch) && stack.length > 0) {
      // An unclosed `<` (a comparison after all) ends with its bracket.
      while (stack.length > 0 && stack[stack.length - 1] === '<') stack.pop();
      if (stack.length > 0) stack.pop();
      if (visit(i, stack.length)) return;
      i++;
      continue;
    }
    if (visit(i, stack.length)) return;
    i++;
  }
}

function opensGeneric(text: string, i: number): boolean {
  return i > 0 && /[\p{L}\p{N}_$.>:]/u.test(text[i - 1]) && text[i + 1] !== '<';
}

function isArrow(text: string, i: number): boolean {
  return text[i - 1] === '=' || text[i - 1] === '-';
}

function isQuote(
  ch: string,
  text: string,
  i: number,
  language: SupportedLanguage | undefined,
): boolean {
  if (ch === '"' || ch === '`') return true;
  if (ch !== "'") return false;
  // A Rust lifetime (`'a`) is not a char literal.
  if (language === 'rust') {
    return text[i + 1] === '\\' || text[i + 2] === "'";
  }
  return true;
}

/** Index just past the string literal that opens at `i`. */
function stringEnd(text: string, i: number): number {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '\\') {
      j += 2;
      continue;
    }
    if (text[j] === quote) return j + 1;
    j++;
  }
  return text.length;
}

/** `text` with comments replaced by a space; string literals are kept. */
function stripComments(
  text: string,
  language: SupportedLanguage | undefined,
): string {
  const hash = language !== undefined && HASH_COMMENTS.has(language);
  const slash = language === undefined || !NO_SLASH_COMMENTS.has(language);
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isQuote(ch, text, i, language)) {
      const end = stringEnd(text, i);
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (slash && ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      out += ' ';
      i = close < 0 ? text.length : close + 2;
      continue;
    }
    const lineComment =
      (slash && ch === '/' && text[i + 1] === '/') ||
      (hash && ch === '#' && text[i + 1] !== '[');
    if (lineComment) {
      const newline = text.indexOf('\n', i);
      out += ' ';
      i = newline < 0 ? text.length : newline;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
