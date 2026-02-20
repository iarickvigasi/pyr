// ─── Tripaneer / BookYogaRetreats OTA Parser ─────────────────
//
// Parses booking notification emails from Tripaneer and BookYogaRetreats
// platforms. Uses multi-strategy field extraction (label-based, regex,
// positional) to handle varying email formats.

import type { OtaParser } from '../ota-parser.js';

export const tripaneerParser: OtaParser = {
  platform: 'tripaneer',

  canParse(_fromAddress: string, _subject: string): boolean {
    throw new Error('Not implemented');
  },

  parse(_html: string, _text: string, _subject: string) {
    throw new Error('Not implemented');
  },
};
