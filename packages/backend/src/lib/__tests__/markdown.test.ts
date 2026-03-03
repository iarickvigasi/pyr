import { describe, expect, it } from 'vitest';
import { stripMarkdownToPlainText } from '../markdown.js';

describe('stripMarkdownToPlainText', () => {
  it('removes common markdown syntax and preserves readable text', () => {
    const input = [
      '# Heading',
      '',
      'Hi **Yaroslav**,_thanks_ for your message.',
      '',
      '- Item one',
      '- Item two',
      '',
      '[Book now](https://example.com)',
      '',
      '`inline code`',
      '',
      '```txt',
      'Code block line',
      '```',
    ].join('\n');

    const output = stripMarkdownToPlainText(input);

    expect(output).toContain('Heading');
    expect(output).toContain('Hi Yaroslav,thanks for your message.');
    expect(output).toContain('Item one');
    expect(output).toContain('Item two');
    expect(output).toContain('Book now');
    expect(output).toContain('inline code');
    expect(output).toContain('Code block line');
    expect(output).not.toContain('**');
    expect(output).not.toContain('# ');
    expect(output).not.toContain('```');
    expect(output).not.toContain('https://example.com');
  });

  it('returns empty string for blank input', () => {
    expect(stripMarkdownToPlainText('   \n\n')).toBe('');
  });
});
