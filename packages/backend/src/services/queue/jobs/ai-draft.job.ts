// Async AI draft generation job — implemented in E6 (AI Communication Engine).
// Queued after a new inbound message is received. Calls draft-generator.ts
// to generate a reply draft and persists it with status='pending' in ai_drafts.
// Business rule: the draft is NEVER sent automatically — Ines must approve it
// in the inbox before it is dispatched via smtp.service.ts.
export {};
