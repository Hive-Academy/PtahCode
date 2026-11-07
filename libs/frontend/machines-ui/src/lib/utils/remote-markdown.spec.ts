import { remoteMarkdown } from './remote-markdown';

describe('remoteMarkdown', () => {
  it('turns raw HTML into text', () => {
    expect(
      remoteMarkdown('ok <img src=x onerror="a()"> <script>b()</script>'),
    ).toBe('ok &lt;img src=x onerror="a()"> &lt;script>b()&lt;/script>');
  });

  it('turns a markdown image into a link', () => {
    expect(remoteMarkdown('see ![pixel](https://evil.example/p.png)')).toBe(
      'see !\\[pixel](https://evil.example/p.png)',
    );
  });

  it('keeps code spans as written', () => {
    expect(remoteMarkdown('use `<div>` and ``a ` <b>`` then <i>')).toBe(
      'use `<div>` and ``a ` <b>`` then &lt;i>',
    );
  });

  it('keeps an unclosed backtick as text and escapes after it', () => {
    expect(remoteMarkdown('a ` <b>')).toBe('a ` &lt;b>');
  });

  it('keeps fenced code blocks as written', () => {
    const input = ['<p>', '```html', '<img src=x>', '```', '<p>'].join('\n');
    expect(remoteMarkdown(input)).toBe(
      ['&lt;p>', '```html', '<img src=x>', '```', '&lt;p>'].join('\n'),
    );
  });

  it('does not close a fence with a shorter or different fence', () => {
    const input = ['````', '```', '<b>', '~~~', '````', '<b>'].join('\n');
    expect(remoteMarkdown(input)).toBe(
      ['````', '```', '<b>', '~~~', '````', '&lt;b>'].join('\n'),
    );
  });
});
