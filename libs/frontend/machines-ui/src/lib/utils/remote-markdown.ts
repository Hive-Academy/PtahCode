import { Lexer, Marked, type Token } from 'marked';

/**
 * A line that opens a fenced code block, as the renderer's `marked` (v18)
 * reads it: up to 3 spaces, then 3+ backticks with no backtick after them on
 * the line (CommonMark: a backtick fence's info string may not contain one),
 * or 3+ tildes followed by anything.
 */
const FENCE_OPEN = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;

/**
 * What may follow the opener's run on a closing line, as `marked` reads it:
 * more fence characters of either kind, then spaces only (no tab).
 */
const FENCE_CLOSE_TAIL = /^[~`]* *$/;

/**
 * A pristine `marked` instance: its defaults are the renderer's (no
 * extension adds a tokenizer there), and nothing the app registers on the
 * global `marked` runs during the check below.
 */
const RENDERER = new Marked();

/**
 * Makes worker-written markdown inert before the shared renderer sees it
 * (S6). Raw HTML (`<tag ...>`) becomes text, and a markdown image
 * (`![alt](url)`) becomes a plain `!` followed by a link, so the parent never
 * builds remote elements nor loads a worker-chosen image URL. Code spans and
 * fenced code blocks are left as written: the renderer already shows them as
 * text, and escaping there would show the escape itself.
 *
 * The line pass reads fences and code spans the way `marked` does, but not
 * every container rule (a fence inside a list item, a code span over two
 * lines). So the result is lexed with the renderer's own `marked`; when any
 * raw HTML or image token is left, everything is escaped, code included.
 */
export function remoteMarkdown(value: string): string {
  // `marked` reads `\r\n` and `\r` as line ends; so must the fence check.
  const text = value.replace(/\r\n|\r/g, '\n');
  const inert = escapeOutsideCode(text);
  return rendersRemoteContent(inert) ? escapeInline(text) : inert;
}

function escapeOutsideCode(text: string): string {
  const lines = text.split('\n');
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence !== null) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const match = FENCE_OPEN.exec(line);
    if (match) {
      fence = match[1];
      continue;
    }
    lines[index] = escapeOutsideCodeSpans(line);
  }
  return lines.join('\n');
}

/** `marked`: up to 3 spaces, the opener's whole run, then {@link FENCE_CLOSE_TAIL}. */
function closesFence(line: string, fence: string): boolean {
  let indent = 0;
  while (indent < 3 && line[indent] === ' ') indent++;
  const rest = line.slice(indent);
  return (
    rest.startsWith(fence) && FENCE_CLOSE_TAIL.test(rest.slice(fence.length))
  );
}

/** Whether `marked` would build raw HTML or an image from `markdown`. */
function rendersRemoteContent(markdown: string): boolean {
  let found = false;
  RENDERER.walkTokens(
    Lexer.lex(markdown, RENDERER.defaults),
    (token: Token) => {
      if (token.type === 'html' || token.type === 'image') found = true;
    },
  );
  return found;
}

function escapeOutsideCodeSpans(line: string): string {
  let result = '';
  let index = 0;
  while (index < line.length) {
    const tick = line.indexOf('`', index);
    if (tick === -1) {
      result += escapeInline(line.slice(index));
      break;
    }
    result += escapeInline(line.slice(index, tick));
    let run = tick;
    while (line[run] === '`') run++;
    const delimiter = line.slice(tick, run);
    const close = line.indexOf(delimiter, run);
    if (close === -1) {
      // No closing run on this line: the backticks are literal text.
      result += delimiter;
      index = run;
      continue;
    }
    result += line.slice(tick, close + delimiter.length);
    index = close + delimiter.length;
  }
  return result;
}

function escapeInline(text: string): string {
  return text.replace(/</g, '&lt;').replace(/!\[/g, '!\\[');
}
