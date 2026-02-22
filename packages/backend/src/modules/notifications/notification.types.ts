/** Alert types for proactive WhatsApp notifications */
export type AlertType =
  | 'new-booking'
  | 'payment-confirmed'
  | 'guest-arriving'
  | 'overdue-invoice'
  | 'draft-ready';

/** Data shape for the morning briefing */
export interface BriefingData {
  checkInsCount: number;
  checkOutsCount: number;
  events: Array<{
    time: string;
    title: string;
    registered: number;
    capacity: number;
  }>;
  pendingInquiries: number;
  yesterdayRevenue: number;
  isEmpty: boolean;
}

/** Payload sent to OpenClaw hooks */
export interface HookPayload {
  message: string;
}
