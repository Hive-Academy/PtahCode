/** A fence line opens or closes a fenced code block (CommonMark: 3+ ` or ~). */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Makes worker-written markdown inert before the shared renderer sees it
 * (S6). Raw HTML (`<tag ...>`) becomes text, and a markdown image
 * (`![alt](url)`) becomes a plain `!` followed by a link, so the parent never
 * builds remote elements nor loads a worker-chosen image URL. Code spans and
 * fenced code blocks are left as written: the renderer already shows them as
 * text, and escaping there would show the escape itself.
 */
export function remoteMarkdown(value: string): string {
  const lines = value.split('\n');
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = FENCE.exec(line);
    if (fence !== null) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length)
        fence = null;
      continue;
    }
    if (match) {
      fence = match[1];
      continue;
    }
    lines[index] = escapeOutsideCodeSpans(line);
  }
  return lines.join('\n');
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
