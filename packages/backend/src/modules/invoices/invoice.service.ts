// Invoice business logic — implemented in Phase 2 (PayPal integration).
// Will handle PayPal Checkout SDK calls (create invoice, send, void) and
// persist invoice/payment records to DB. All amounts in integer cents (EUR).
// Business rule: always write invoice mutations inside a $transaction with audit log.
export {};
