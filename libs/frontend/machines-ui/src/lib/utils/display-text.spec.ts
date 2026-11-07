import {
  DISPLAY_TEXT_MAX_LENGTH,
  DisplayTextPipe,
  displayBlockText,
  displayBlockValue,
  displayText,
} from './display-text';

describe('displayText', () => {
  it('returns an empty string for null and undefined', () => {
    expect(displayText(null)).toBe('');
    expect(displayText(undefined)).toBe('');
  });

  it('keeps ordinary text unchanged', () => {
    expect(displayText('Horus 0.1.70')).toBe('Horus 0.1.70');
  });

  it('strips bidi overrides, isolates and marks', () => {
    expect(displayText('evil\u202Egnp.exe')).toBe('evilgnp.exe');
    expect(displayText('\u2066a\u2069\u200Fb\u061C')).toBe('ab');
  });

  it('strips control and zero-width characters', () => {
    expect(displayText('a\u0000b\u0007c\u009Bd')).toBe('abcd');
    expect(displayText('zero\u200Bwidth\uFEFF')).toBe('zerowidth');
  });

  it('turns line breaks and tabs into single spaces and trims', () => {
    expect(displayText('  line one\r\n\tline   two  ')).toBe(
      'line one line two',
    );
  });

  it('caps the length at 80 code points with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const shown = displayText(long);
    expect(Array.from(shown)).toHaveLength(DISPLAY_TEXT_MAX_LENGTH);
    expect(shown.endsWith('…')).toBe(true);
  });

  it('does not cut a surrogate pair in half', () => {
    const shown = displayText('😀'.repeat(10), 5);
    expect(shown).toBe('😀😀😀😀…');
  });

  it('keeps text at exactly the cap', () => {
    const exact = 'y'.repeat(DISPLAY_TEXT_MAX_LENGTH);
    expect(displayText(exact)).toBe(exact);
  });

  it('is available as a pipe with an optional cap', () => {
    const pipe = new DisplayTextPipe();
    expect(pipe.transform('a\u202Eb')).toBe('ab');
    expect(pipe.transform('abcdef', 4)).toBe('abc…');
  });
});

describe('displayBlockText', () => {
  it('returns an empty string for null and undefined', () => {
    expect(displayBlockText(null)).toBe('');
    expect(displayBlockText(undefined)).toBe('');
  });

  it('never cuts: a 10 000 character value is shown whole', () => {
    const long = 'rm -rf ' + 'a'.repeat(10_000);
    expect(displayBlockText(long)).toBe(long);
  });

  it('strips the same bidi, control and zero-width characters', () => {
    // Built from code points so no literal bidi character sits in the source.
    const cp = (...points: number[]) => String.fromCodePoint(...points);
    expect(displayBlockText(`evil${cp(0x202e)}gnp.exe`)).toBe('evilgnp.exe');
    expect(
      displayBlockText(`${cp(0x2066)}a${cp(0x2069, 0x200f)}b${cp(0x061c)}`),
    ).toBe('ab');
    expect(displayBlockText(`a${cp(0, 7)}b${cp(0x9b)}c`)).toBe('abc');
    expect(displayBlockText(`zero${cp(0x200b)}width${cp(0xfeff)}`)).toBe(
      'zerowidth',
    );
  });

  it('keeps line breaks, tabs and spacing; normalises carriage returns', () => {
    expect(displayBlockText('  one\r\n\ttwo   three\rfour\fx')).toBe(
      '  one\n\ttwo   three\nfour x',
    );
  });
});

describe('displayBlockValue', () => {
  it('cleans every string, keys included, and keeps other JSON values', () => {
    expect(
      displayBlockValue({
        'na\u202Eme': ['a\u200Bb', 1, true, null],
        nested: { text: 'line one\r\nline\u0007 two' },
      }),
    ).toEqual({
      name: ['ab', 1, true, null],
      nested: { text: 'line one\nline two' },
    });
  });

  it('keeps a __proto__ key as a plain key', () => {
    const value = displayBlockValue(
      JSON.parse('{"__proto__": {"polluted": true}}'),
    ) as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.keys(value)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('replaces non-JSON values and over-deep nesting with null', () => {
    expect(displayBlockValue({ f: () => 1, u: undefined })).toEqual({ f: null });
    let deep: unknown = 'leaf';
    for (let i = 0; i < 100; i++) deep = [deep];
    expect(JSON.stringify(displayBlockValue(deep))).toContain('null');
  });
});
