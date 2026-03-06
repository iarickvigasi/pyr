/**
 * Tool activity event bus.
 *
 * When the OpenClaw plugin calls the PYR backend API (X-API-Key auth),
 * we detect the route and emit a tool-call event. The assistant chat
 * route subscribes to these events and injects synthetic SSE chunks
 * so the frontend can show "Searching guests..." indicators.
 */
import { EventEmitter } from 'events';

export interface ToolCallEvent {
  toolName: string;
}

class ToolActivityBus extends EventEmitter {
  emitToolCall(toolName: string): void {
    this.emit('tool-call', { toolName } satisfies ToolCallEvent);
  }

  onToolCall(handler: (event: ToolCallEvent) => void): () => void {
    this.on('tool-call', handler);
    return () => this.off('tool-call', handler);
  }
}

export const toolActivityBus = new ToolActivityBus();

/**
 * Map "METHOD /api/v1/..." patterns to PYR tool names.
 * Order matters — more specific routes (with sub-paths) must come first.
 */
const ROUTE_TO_TOOL: ReadonlyArray<readonly [string, string, string]> = [
  // Guest tools
  ['POST', '/api/v1/guests/merge', 'prepare_merge_guests'],
  ['GET', '/api/v1/guests/:id', 'get_guest'],
  ['PATCH', '/api/v1/guests/:id', 'prepare_update_guest'],
  ['DELETE', '/api/v1/guests/:id', 'prepare_delete_guest'],
  ['GET', '/api/v1/guests', 'search_guests'],
  ['POST', '/api/v1/guests', 'prepare_create_guest'],

  // Booking tools
  ['GET', '/api/v1/bookings/:id', 'get_booking'],
  ['PATCH', '/api/v1/bookings/:id', 'prepare_update_booking'],
  ['DELETE', '/api/v1/bookings/:id', 'prepare_cancel_booking'],
  ['GET', '/api/v1/bookings', 'list_bookings'],
  ['POST', '/api/v1/bookings', 'prepare_create_booking'],

  // Room tools
  ['GET', '/api/v1/rooms', 'list_rooms'],
  ['GET', '/api/v1/room-types', 'list_room_types'],
  ['GET', '/api/v1/availability', 'check_availability'],

  // Event tools
  ['POST', '/api/v1/events/:id/registrations/:registrationId/cancel', 'prepare_cancel_event_registration'],
  ['GET', '/api/v1/events/:id/registrations', 'list_event_registrations'],
  ['POST', '/api/v1/events/:id/book', 'prepare_register_guest'],
  ['GET', '/api/v1/events/:id', 'get_event'],
  ['PATCH', '/api/v1/events/:id', 'prepare_update_event'],
  ['DELETE', '/api/v1/events/:id', 'prepare_delete_event'],
  ['GET', '/api/v1/events', 'list_events'],
  ['POST', '/api/v1/events', 'prepare_create_event'],

  // Conversation tools
  ['GET', '/api/v1/conversations/:id', 'get_conversation'],
  ['PATCH', '/api/v1/conversations/:id', 'update_conversation'],
  ['GET', '/api/v1/conversations', 'list_conversations'],

  // Dashboard tools
  ['GET', '/api/v1/dashboard/stats', 'get_dashboard_stats'],
  ['GET', '/api/v1/dashboard/today', 'get_today_schedule'],

  // Settings tools
  ['GET', '/api/v1/settings', 'get_settings'],
  ['PUT', '/api/v1/settings/:key', 'update_setting'],

  // Draft tools
  ['GET', '/api/v1/conversations/:id/drafts', 'list_pending_drafts'],
  ['POST', '/api/v1/conversations/:id/approve', 'approve_draft'],

  // Agent/action tools
  ['POST', '/api/v1/agent/confirm', 'confirm_action'],
  ['POST', '/api/v1/agent/cancel', 'cancel_action'],
];

function matchRoute(pattern: string, path: string): boolean {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, i) =>
    part.startsWith(':') || part === pathParts[i],
  );
}

export function inferToolName(method: string, url: string): string | null {
  const path = url.split('?')[0]!;
  for (const entry of ROUTE_TO_TOOL) {
    if (entry[0] === method && matchRoute(entry[1], path)) return entry[2];
  }
  return null;
}
