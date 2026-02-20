import { franc } from 'franc-min';

/**
 * Detect whether text is English or German.
 *
 * Uses franc-min (trigram-based language detection) restricted to English
 * and German. Falls back to English for short or ambiguous text.
 *
 * @param text - The text to analyze
 * @returns 'en' or 'de'
 */
export function detectLanguage(text: string): 'en' | 'de' {
  if (!text || text.length < 20) return 'en';

  const result = franc(text, { only: ['eng', 'deu'] });
  return result === 'deu' ? 'de' : 'en';
}
