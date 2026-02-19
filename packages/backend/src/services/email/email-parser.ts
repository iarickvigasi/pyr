// Email parser — implemented in E4 (Email Ingestion & Unified Inbox).
// Parses raw IMAP messages: extracts sender, subject, body, threading headers
// (In-Reply-To, References), and detects OTA platform emails (GetYourGuide,
// Viator, BookRetreats) for auto-categorization in Phase 4.
// Business rule: always extract and preserve threading headers for email clients.
export {};
