// IMAP polling service — implemented in E4 (Email Ingestion & Unified Inbox).
// Polls puppyyogaretreat@gmx.de via IMAP (imap.gmx.net:993) on a schedule.
// For each new email: creates a guest (if unknown sender), opens/updates a
// conversation, persists the message, and optionally queues an AI draft job.
// Business rule: maintain In-Reply-To and References headers for proper threading.
export {};
