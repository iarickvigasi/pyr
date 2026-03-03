/**
 * Convert markdown-like AI output into safe plain-text email content.
 * This is intentionally conservative for MVP reliability.
 */
export function stripMarkdownToPlainText(input: string): string {
  if (!input) return '';

  let text = input.replace(/\r\n/g, '\n');

  // Fenced code blocks -> keep inner text, drop fences/language tag.
  text = text.replace(/```[^\n]*\n([\s\S]*?)```/g, '$1');

  // Inline code
  text = text.replace(/`([^`]+)`/g, '$1');

  // Images and links
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Headings/quotes/list markers
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  text = text.replace(/^\s{0,3}>\s?/gm, '');
  text = text.replace(/^\s{0,3}[-*+]\s+/gm, '');
  text = text.replace(/^\s{0,3}\d+\.\s+/gm, '');

  // Emphasis / strike
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  text = text.replace(/~~([^~]+)~~/g, '$1');

  // Horizontal rules
  text = text.replace(/^\s*([-*_]){3,}\s*$/gm, '');

  // Normalize whitespace/newlines for email body.
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
