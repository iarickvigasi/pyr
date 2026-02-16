const roomTypePalette = [
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800' },
  { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-800' },
  { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-800' },
  { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-800' },
  { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-800' },
  { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-800' },
];

const roomTypeMap = new Map<string, number>();

export function getRoomTypeColor(roomTypeName: string) {
  if (!roomTypeMap.has(roomTypeName)) {
    roomTypeMap.set(roomTypeName, roomTypeMap.size % roomTypePalette.length);
  }
  return roomTypePalette[roomTypeMap.get(roomTypeName)!]!;
}

export const eventTypeStyles: Record<string, { bg: string; border: string; text: string }> = {
  puppy_yoga: { bg: 'bg-pink-100', border: 'border-pink-400', text: 'text-pink-800' },
  beach_walk: { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-800' },
  coffee_cake_cuddles: { bg: 'bg-yellow-100', border: 'border-yellow-400', text: 'text-yellow-800' },
  retreat: { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-800' },
};

export function getStatusModifier(status: string): string {
  switch (status) {
    case 'inquiry':
      return 'opacity-60 border-dashed';
    case 'checked_in':
      return 'border-2';
    default:
      return '';
  }
}
