import type { Prisma } from '@prisma/client';

/**
 * Entity types with proper relationships
 * These types represent the actual data returned from the database
 */

// ──────────────────────────────────────────────────────────────
// Guest Types
// ──────────────────────────────────────────────────────────────

export type Guest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string;
  dietaryNeeds: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type GuestWithRelations = Guest & {
  bookings?: Booking[];
  eventBookings?: EventBooking[];
  conversations?: Conversation[];
  invoices?: Invoice[];
};

// ──────────────────────────────────────────────────────────────
// Room Types
// ──────────────────────────────────────────────────────────────

export type RoomType = {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  maxOccupancy: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Room = {
  id: string;
  roomTypeId: string;
  name: string;
  status: 'available' | 'occupied' | 'maintenance';
  createdAt: Date;
  updatedAt: Date;
};

export type RoomWithType = Room & {
  roomType: RoomType;
};

// ──────────────────────────────────────────────────────────────
// Season Types
// ──────────────────────────────────────────────────────────────

export type Season = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  priceMultiplier: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
};

// ──────────────────────────────────────────────────────────────
// Booking Types
// ──────────────────────────────────────────────────────────────

export type BookingStatus = 'inquiry' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';

export type Booking = {
  id: string;
  guestId: string;
  roomId: string;
  checkIn: Date;
  checkOut: Date;
  status: BookingStatus;
  totalPrice: number;
  source: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type BookingWithRelations = Booking & {
  guest: Pick<Guest, 'id' | 'name' | 'email'>;
  room: RoomWithType;
};

// ──────────────────────────────────────────────────────────────
// Event Types
// ──────────────────────────────────────────────────────────────

export type EventType = 'puppy_yoga' | 'beach_walk' | 'coffee_cake_cuddles' | 'retreat';

export type Event = {
  id: string;
  type: EventType;
  title: string;
  date: Date;
  time: string;
  capacity: number;
  location: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EventBookingStatus = 'confirmed' | 'waitlisted' | 'cancelled';

export type EventBooking = {
  id: string;
  eventId: string;
  guestId: string;
  status: EventBookingStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type EventWithBookings = Event & {
  eventBookings: (EventBooking & { guest: Pick<Guest, 'id' | 'name' | 'email'> })[];
};

// ──────────────────────────────────────────────────────────────
// Conversation & Message Types
// ──────────────────────────────────────────────────────────────

export type Channel =
  | 'email'
  | 'whatsapp'
  | 'instagram'
  | 'telegram'
  | 'gyg'
  | 'viator'
  | 'bookretreats'
  | 'tripaneer';

export type ConversationStatus = 'open' | 'closed';

export type Conversation = {
  id: string;
  guestId: string;
  channel: Channel;
  subject: string | null;
  status: ConversationStatus;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageDirection = 'in' | 'out';

export type Message = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  content: string;
  channel: Channel;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  sentAt: Date;
  createdAt: Date;
};

export type ConversationWithMessages = Conversation & {
  guest: Pick<Guest, 'id' | 'name' | 'email'>;
  messages: Message[];
};

// ──────────────────────────────────────────────────────────────
// AI Draft Types
// ──────────────────────────────────────────────────────────────

export type AiDraftStatus = 'pending' | 'approved' | 'edited' | 'rejected';

export type AiDraft = {
  id: string;
  conversationId: string;
  messageId: string | null;
  content: string;
  status: AiDraftStatus;
  model: string;
  tokensUsed: number;
  createdAt: Date;
  updatedAt: Date;
};

// ──────────────────────────────────────────────────────────────
// Invoice & Payment Types
// ──────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export type Invoice = {
  id: string;
  bookingId: string;
  guestId: string;
  invoiceNumber: string;
  amount: number;
  status: InvoiceStatus;
  paypalInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentMethod = 'paypal' | 'bank_transfer' | 'cash';

export type Payment = {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  receivedAt: Date;
  createdAt: Date;
};

// ──────────────────────────────────────────────────────────────
// Setting Types
// ──────────────────────────────────────────────────────────────

export type Setting = {
  id: string;
  key: string;
  value: unknown; // JSON value, type depends on the setting
  updatedAt: Date;
};

// ──────────────────────────────────────────────────────────────
// Audit Log Types
// ──────────────────────────────────────────────────────────────

export type AuditAction = 'create' | 'update' | 'delete';

export type AuditLog = {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes: unknown | null; // JSON, can be any structure
  actor: string;
  createdAt: Date;
};

// ──────────────────────────────────────────────────────────────
// Admin User Types
// ──────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminUserSafe = Omit<AdminUser, 'passwordHash'>;

// ──────────────────────────────────────────────────────────────
// Dashboard Types
// ──────────────────────────────────────────────────────────────

export type DashboardStats = {
  totalBookings: number;
  activeBookings: number;
  totalRevenue: number;
  pendingInquiries: number;
  upcomingEvents: number;
  openConversations: number;
};

export type TodayActivity = {
  checkIns: BookingWithRelations[];
  checkOuts: BookingWithRelations[];
  events: EventWithBookings[];
};
