import {
  DISPLAY_TEXT_MAX_LENGTH,
  DisplayTextPipe,
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
