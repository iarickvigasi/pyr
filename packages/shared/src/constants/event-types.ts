export const EVENT_TYPES = [
  'puppy_yoga',
  'beach_walk',
  'coffee_cake_cuddles',
  'retreat',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
