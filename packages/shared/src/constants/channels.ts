export const CHANNELS = [
  'email',
  'whatsapp',
  'instagram',
  'telegram',
  'gyg',
  'viator',
  'bookretreats',
  'tripaneer',
] as const;

export type Channel = (typeof CHANNELS)[number];
