import { extractJsonObject } from './skill-json-extract';

describe('extractJsonObject', () => {
  it('prefers a fenced JSON object over an earlier inline object', () => {
    expect(
      extractJsonObject('Example {"example":true}\n```json\n{"items":[]}\n```\nDone.'),
    ).toEqual({ items: [] });
  });

  it('extracts nested JSON between leading and trailing prose', () => {
    const object = { items: [{ reason: 'a closing } and an escaped " and \\' }] };
    expect(extractJsonObject(`Here it is: ${JSON.stringify(object)} Done.`)).toEqual(object);
  });

  it('extracts the first brace-balanced object when several are present', () => {
    expect(extractJsonObject('{"first":1} and {"second":2}')).toEqual({ first: 1 });
  });

  it('continues after an invalid balanced object before a valid draft', () => {
    expect(
      extractJsonObject('Context: {workspace}\nDraft: {"items":[]}'),
    ).toEqual({ items: [] });
  });

  it.each(['{invalid}', '{"items":[}', '{"items":[]', '', '  ', 'no object'])(
    'returns null when the response has no usable JSON object (%p)',
    (text) => expect(extractJsonObject(text)).toBeNull(),
  );
});
