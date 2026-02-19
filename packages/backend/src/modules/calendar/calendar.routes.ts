// Calendar sync routes — implemented in E7.
// Exposes POST /api/v1/calendar/sync to trigger a manual CalDAV push.
// Business rule: data flows ONE WAY — DB → Apple Calendar. Never read from
// CalDAV to update DB. The underlying sync logic lives in services/caldav/caldav.service.ts.
// See: ARCHITECTURE.md "Audit Log Scope" for which entities trigger calendar events.
import type { FastifyInstance } from 'fastify';

export default async function calendarRoutes(_app: FastifyInstance): Promise<void> {
  // Calendar sync endpoints — implemented in E7
}
