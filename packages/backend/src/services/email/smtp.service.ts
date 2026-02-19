// SMTP sending service — implemented in E4 (Email Ingestion & Unified Inbox).
// Sends outbound email via GMX SMTP (mail.gmx.net:587) using nodemailer.
// Preserves In-Reply-To and References headers to maintain proper email threading
// in the guest's email client. Always sends as puppyyogaretreat@gmx.de.
export {};
