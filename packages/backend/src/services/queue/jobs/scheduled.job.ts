// Scheduled job handler — implemented in E8 (Personal AI Assistant).
// Runs daily cron tasks: morning briefing (today's check-ins, events, pending replies)
// sent to Ines via Telegram, and pre-arrival reminders to guests (E9 phase).
// Business rule: all guest-facing messages from scheduled jobs are AI drafts —
// they are never sent without Ines's explicit approval via the assistant interface.
export {};
