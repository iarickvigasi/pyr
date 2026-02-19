/**
 * Module contracts define the public interface of each integration module.
 * Cross-module communication happens via BullMQ queues (job payloads defined in jobs.ts).
 * Direct function imports across module boundaries are prohibited.
 */

/** Email module — IMAP polling, email parsing, SMTP sending */
export interface EmailModuleContract {
  /** Start IMAP polling on the configured schedule */
  startPolling(): Promise<void>;
  /** Stop IMAP polling */
  stopPolling(): Promise<void>;
  /** Send an email via SMTP with threading headers */
  sendEmail(params: SendEmailParams): Promise<{ messageId: string }>;
  /** Check if the email service is healthy (IMAP + SMTP connections) */
  healthCheck(): Promise<{ imap: boolean; smtp: boolean }>;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  /** HTML body (optional, plain text fallback) */
  html?: string;
  /** For threading: In-Reply-To header value */
  inReplyTo?: string;
  /** For threading: References header values */
  references?: string[];
}

/** AI module — LLM integration, draft generation, classification */
export interface AiModuleContract {
  /** Generate a reply draft for a conversation message */
  generateDraft(params: GenerateDraftParams): Promise<AiDraftResult>;
  /** Classify an incoming message (inquiry, OTA, spam, etc.) */
  classifyMessage(content: string, metadata?: Record<string, unknown>): Promise<MessageClassification>;
  /** Check if the AI service is healthy (LLM API reachable) */
  healthCheck(): Promise<{ primary: boolean; fallback: boolean }>;
}

export interface GenerateDraftParams {
  conversationId: string;
  messageId: string;
  messageContent: string;
  guestLanguage: 'en' | 'de';
  /** Injected business context (guest history, availability, etc.) */
  context?: Record<string, unknown>;
}

export interface AiDraftResult {
  content: string;
  model: string;
  tokensUsed: { input: number; output: number };
  costEur: number;
}

export type MessageCategory = 'guest-inquiry' | 'ota-notification' | 'spam-newsletter' | 'admin-system';

export interface MessageClassification {
  category: MessageCategory;
  confidence: number;
  flags: string[]; // e.g., 'complaint', 'medical', 'cancellation', 'adoption'
}

/** Calendar module — CalDAV sync to Apple Calendar */
export interface CalendarModuleContract {
  /** Sync a booking to Apple Calendar (create/update/delete) */
  syncBooking(bookingId: string, action: 'create' | 'update' | 'delete'): Promise<void>;
  /** Sync an event to Apple Calendar (create/update/delete) */
  syncEvent(eventId: string, action: 'create' | 'update' | 'delete'): Promise<void>;
  /** Check if the CalDAV service is healthy (iCloud reachable) */
  healthCheck(): Promise<{ caldav: boolean }>;
}

/** Assistant module — NLU agent, query/action capabilities */
export interface AssistantModuleContract {
  /** Process a natural language message from Ines */
  processMessage(message: string, channel: 'dashboard' | 'whatsapp'): Promise<AssistantResponse>;
  /** Send a proactive notification to Ines */
  notify(message: string, channel?: 'dashboard' | 'whatsapp'): Promise<void>;
  /** Check if the assistant service is healthy */
  healthCheck(): Promise<{ agent: boolean; channel: boolean }>;
}

export interface AssistantResponse {
  text: string;
  /** If the assistant wants to perform an action, it requests confirmation */
  pendingAction?: {
    description: string;
    actionId: string;
  };
}
