// IMAP fetch job — implemented in E4 (Email Ingestion & Unified Inbox).
// Runs on a schedule (every 5 minutes). Calls imap.service.ts to poll for
// new emails, then creates conversations + messages for any unread mail.
// Business rule: idempotent — skip messages already in DB (by Message-ID header).
export {};
