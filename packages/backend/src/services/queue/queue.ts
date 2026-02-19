// BullMQ queue initialization — implemented in E4 (email jobs) and E6 (AI draft jobs).
// Creates named queues backed by Redis. Available queues:
//   - 'email-poll'    → periodic IMAP fetch (E4)
//   - 'ai-draft'      → async AI draft generation per incoming message (E6)
//   - 'calendar-sync' → CalDAV push after booking/event changes (E7)
//   - 'scheduled'     → daily briefings and reminders (E8)
// Workers are defined in services/queue/worker.ts.
export {};
