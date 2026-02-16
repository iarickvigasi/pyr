export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
