export interface Room {
  id: string;
  roomTypeId: string;
  name: string;
  status: 'available' | 'occupied' | 'maintenance';
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomType {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  maxOccupancy: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Season {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  priceMultiplier: number;
  createdAt: Date;
  updatedAt: Date;
}
