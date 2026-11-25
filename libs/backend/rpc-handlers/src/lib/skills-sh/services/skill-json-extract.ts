/**
 * Extract a JSON object from model text. The caller owns envelope and item
 * validation.
 */
export function extractJsonObject(text: string): unknown | null {
  for (const [, body] of text.matchAll(/```json\b[ \t]*\r?\n?([\s\S]*?)```/gi)) {
    const object = parseObject(body);
    if (object !== null) return object;
  }

  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) return parseObject(text.slice(start, index + 1));
    }
  }
  return null;
}

function parseObject(text: string): object | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    // degradation-audit: optional-capability - Invalid JSON candidates can be skipped during text extraction.
    return null;
  }
}
