import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import type { ApiClient } from '../lib/api-client.js';
import { formatDate, formatBookingStatus, formatEurCents, dashboardUrl } from '../lib/formatters.js';
import { storePendingAction } from '../lib/confirmation.js';

interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  dietaryNeeds: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
  bookings?: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    status: string;
    totalPrice: number;
  }>;
  conversations?: Array<{
    id: string;
    subject: string | null;
    status: string;
  }>;
}

function formatGuest(g: Guest): Record<string, unknown> {
  return {
    name: g.name,
    email: g.email,
    phone: g.phone,
    language: g.language,
    dietaryNeeds: g.dietaryNeeds,
    source: g.source,
    tags: g.tags,
    notes: g.notes,
    memberSince: formatDate(g.createdAt),
    dashboardUrl: dashboardUrl(`/guests/${g.id}`),
  };
}

function formatGuestDetail(g: Guest): Record<string, unknown> {
  return {
    ...formatGuest(g),
    bookings: g.bookings?.map(b => ({
      id: b.id,
      checkIn: formatDate(b.checkIn),
      checkOut: formatDate(b.checkOut),
      status: b.status,
      totalPrice: b.totalPrice,
      dashboardUrl: dashboardUrl(`/bookings/${b.id}`),
    })),
    conversations: g.conversations?.map(c => ({
      id: c.id,
      subject: c.subject,
      status: c.status,
      dashboardUrl: dashboardUrl(`/conversations/${c.id}`),
    })),
  };
}

export function registerGuestTools(api: OpenClawPluginApi, client: ApiClient): void {
  api.registerTool({
    name: 'search_guests',
    label: 'Search Guests',
    description:
      'Search for guests by name, email, or phone number. Returns matching guest profiles. Example: search for "Anna" or "anna@gmail.com" or "+49".',
    parameters: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search term (name, email, or phone)' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
      },
      required: ['search'],
    },
    async execute(_id: string, params: { search: string; limit?: number }) {
      const data = await client.get<Guest[]>('/api/v1/guests', {
        search: params.search,
        limit: params.limit ?? 10,
      });
      const guests = (data as unknown as Guest[]);
      const result = {
        guests: guests.map(formatGuest),
        totalReturned: guests.length,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'get_guest',
    label: 'Get Guest Details',
    description:
      'Get a specific guest profile with full details including booking history and conversations. Use when you already have a guest ID.',
    parameters: {
      type: 'object' as const,
      properties: {
        guestId: { type: 'string', description: 'The guest ID (UUID)' },
      },
      required: ['guestId'],
    },
    async execute(_id: string, params: { guestId: string }) {
      const data = await client.get<Guest>(`/api/v1/guests/${params.guestId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(formatGuestDetail(data as unknown as Guest), null, 2) }], details: {} };
    },
  });

  api.registerTool({
    name: 'list_guests',
    label: 'List Guests',
    description:
      'List recent guests. Useful to see who was added recently or browse the guest list. Results are sorted by creation date.',
    parameters: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
      },
      required: [],
    },
    async execute(_id: string, params: { limit?: number }) {
      const data = await client.get<Guest[]>('/api/v1/guests', {
        limit: params.limit ?? 10,
      });
      const guests = (data as unknown as Guest[]);
      const result = {
        guests: guests.map(formatGuest),
        totalReturned: guests.length,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  // ── 4. Prepare Create Guest ──────────────────────────

  api.registerTool({
    name: 'prepare_create_guest',
    label: 'Create Guest',
    description:
      'Prepare a new guest profile for confirmation. Returns a summary for Ines to review before creating. At least one of email or phone is required. Use this when Ines asks to add a new guest.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Guest full name (required)' },
        email: { type: 'string', description: 'Guest email address (at least email or phone is required)' },
        phone: { type: 'string', description: 'Guest phone number (at least email or phone is required)' },
        language: { type: 'string', description: 'Preferred language: en or de (default: en)' },
        dietaryNeeds: { type: 'string', description: 'Dietary requirements or allergies' },
        source: { type: 'string', description: 'How the guest found us (e.g., website, instagram, referral)' },
        notes: { type: 'string', description: 'Any additional notes about the guest' },
      },
      required: ['name'],
    },
    async execute(
      _id: string,
      params: {
        name: string;
        email?: string;
        phone?: string;
        language?: string;
        dietaryNeeds?: string;
        source?: string;
        notes?: string;
      },
    ) {
      // At least email or phone is required (database constraint)
      if (!params.email && !params.phone) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: 'At least an email or phone number is required to create a guest. Please ask Ines for the guest\'s contact info.',
            }, null, 2),
          }],
          details: {},
        };
      }

      // Check for existing guest with same name to warn about duplicates
      const existing = await client.get<Guest[]>('/api/v1/guests', { search: params.name, limit: 5 });
      const matches = (existing as unknown as Guest[]);
      const duplicateWarning = matches.length > 0
        ? `Note: Found ${matches.length} existing guest(s) matching "${params.name}": ${matches.map(g => `${g.name} (${g.email ?? 'no email'})`).join(', ')}. Confirm this is a new guest, not a duplicate.`
        : undefined;

      const language = params.language === 'de' ? 'de' : 'en';
      const actionId = crypto.randomUUID();

      const payload: Record<string, unknown> = {
        name: params.name,
        language,
      };
      if (params.email) payload['email'] = params.email;
      if (params.phone) payload['phone'] = params.phone;
      if (params.dietaryNeeds) payload['dietaryNeeds'] = params.dietaryNeeds;
      if (params.source) payload['source'] = params.source;
      if (params.notes) payload['notes'] = params.notes;

      storePendingAction({
        id: actionId,
        type: 'create_guest',
        summary: `New guest: ${params.name}${params.email ? ` (${params.email})` : ''}`,
        payload,
        createdAt: Date.now(),
      });

      const result: Record<string, unknown> = {
        actionId,
        summary: {
          name: params.name,
          email: params.email ?? null,
          phone: params.phone ?? null,
          language,
          dietaryNeeds: params.dietaryNeeds ?? null,
          source: params.source ?? null,
          notes: params.notes ?? null,
        },
        instruction: 'Present this as a structured summary and ask Ines to reply OK to confirm or Cancel to reject.',
      };
      if (duplicateWarning) {
        result['duplicateWarning'] = duplicateWarning;
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], details: {} };
    },
  });

  // ── 5. Prepare Update Guest ────────────────────────────

  api.registerTool({
    name: 'prepare_update_guest',
    label: 'Update Guest',
    description:
      'Prepare changes to an existing guest profile for confirmation. Shows a before/after diff of the fields being changed. Use when Ines asks to update a guest\'s name, email, phone, language, dietary needs, source, tags, or notes.',
    parameters: {
      type: 'object' as const,
      properties: {
        guestId: { type: 'string', description: 'The guest ID (UUID)' },
        name: { type: 'string', description: 'Updated guest name' },
        email: { type: 'string', description: 'Updated email address' },
        phone: { type: 'string', description: 'Updated phone number' },
        language: { type: 'string', description: 'Updated language: en or de' },
        dietaryNeeds: { type: 'string', description: 'Updated dietary requirements' },
        source: { type: 'string', description: 'Updated source' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Updated tags (replaces all tags)' },
        notes: { type: 'string', description: 'Updated notes' },
      },
      required: ['guestId'],
    },
    async execute(
      _id: string,
      params: {
        guestId: string;
        name?: string;
        email?: string;
        phone?: string;
        language?: string;
        dietaryNeeds?: string;
        source?: string;
        tags?: string[];
        notes?: string;
      },
    ) {
      const current = await client.get<Guest>(`/api/v1/guests/${params.guestId}`);
      const g = current as unknown as Guest;

      // Build diff of changed fields
      const diff: Record<string, { from: unknown; to: unknown }> = {};
      const changes: Record<string, unknown> = {};

      const fields: Array<{ key: keyof typeof params; currentVal: unknown }> = [
        { key: 'name', currentVal: g.name },
        { key: 'email', currentVal: g.email },
        { key: 'phone', currentVal: g.phone },
        { key: 'language', currentVal: g.language },
        { key: 'dietaryNeeds', currentVal: g.dietaryNeeds },
        { key: 'source', currentVal: g.source },
        { key: 'notes', currentVal: g.notes },
      ];

      for (const { key, currentVal } of fields) {
        if (params[key] !== undefined && params[key] !== currentVal) {
          diff[key] = { from: currentVal, to: params[key] };
          changes[key] = params[key];
        }
      }

      // Handle tags separately (array comparison)
      if (params.tags !== undefined && JSON.stringify(params.tags) !== JSON.stringify(g.tags)) {
        diff['tags'] = { from: g.tags, to: params.tags };
        changes['tags'] = params.tags;
      }

      if (Object.keys(diff).length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: `No changes detected for guest "${g.name}". The provided values match the current profile.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      const actionId = crypto.randomUUID();

      storePendingAction({
        id: actionId,
        type: 'update_guest',
        summary: `Update guest "${g.name}": ${Object.keys(diff).join(', ')}`,
        payload: { guestId: params.guestId, ...changes },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            guest: g.name,
            changes: diff,
            instruction: 'Show Ines the before/after diff and ask her to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 6. Prepare Delete (Archive) Guest ──────────────────

  api.registerTool({
    name: 'prepare_delete_guest',
    label: 'Archive Guest',
    description:
      'Prepare to archive (soft-delete) a guest. The guest record is preserved but hidden from active lists. All bookings and conversations are kept. Use when Ines asks to remove or archive a guest.',
    parameters: {
      type: 'object' as const,
      properties: {
        guestId: { type: 'string', description: 'The guest ID (UUID) to archive' },
      },
      required: ['guestId'],
    },
    async execute(_id: string, params: { guestId: string }) {
      const current = await client.get<Guest>(`/api/v1/guests/${params.guestId}`);
      const g = current as unknown as Guest;

      const actionId = crypto.randomUUID();

      storePendingAction({
        id: actionId,
        type: 'delete_guest',
        summary: `Archive guest "${g.name}" (${g.email ?? 'no email'})`,
        payload: { guestId: params.guestId },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            summary: {
              action: 'Archive guest',
              name: g.name,
              email: g.email,
              phone: g.phone,
              note: 'This is a soft delete. The guest will be hidden from active lists but all bookings and conversations are preserved.',
            },
            instruction: 'Present this summary and ask Ines to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });

  // ── 7. Prepare Merge Guests ────────────────────────────

  api.registerTool({
    name: 'prepare_merge_guests',
    label: 'Merge Guests',
    description:
      'Prepare to merge two duplicate guest records into one. All bookings and conversations from the secondary guest are transferred to the primary guest. The secondary guest is archived. Use when Ines identifies duplicate guest profiles.',
    parameters: {
      type: 'object' as const,
      properties: {
        primaryId: { type: 'string', description: 'The primary guest ID (the one to keep)' },
        secondaryId: { type: 'string', description: 'The secondary guest ID (the duplicate to merge and archive)' },
      },
      required: ['primaryId', 'secondaryId'],
    },
    async execute(_id: string, params: { primaryId: string; secondaryId: string }) {
      let primary: Guest;
      let secondary: Guest;

      try {
        primary = await client.get<Guest>(`/api/v1/guests/${params.primaryId}`) as unknown as Guest;
      } catch {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Primary guest not found (ID: ${params.primaryId}). Please verify the guest ID.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      try {
        secondary = await client.get<Guest>(`/api/v1/guests/${params.secondaryId}`) as unknown as Guest;
      } catch {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: `Secondary guest not found (ID: ${params.secondaryId}). Please verify the guest ID.`,
            }, null, 2),
          }],
          details: {},
        };
      }

      const actionId = crypto.randomUUID();

      storePendingAction({
        id: actionId,
        type: 'merge_guests',
        summary: `Merge "${secondary.name}" into "${primary.name}"`,
        payload: { primaryId: params.primaryId, secondaryId: params.secondaryId },
        createdAt: Date.now(),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            actionId,
            summary: {
              action: 'Merge guests',
              primaryGuest: { name: primary.name, email: primary.email, phone: primary.phone },
              secondaryGuest: { name: secondary.name, email: secondary.email, phone: secondary.phone },
              note: `Merge "${secondary.name}" into "${primary.name}" -- all bookings and conversations will be transferred to "${primary.name}", and "${secondary.name}" will be archived.`,
            },
            instruction: 'Present this summary and ask Ines to reply OK to confirm or Cancel to reject.',
          }, null, 2),
        }],
        details: {},
      };
    },
  });
}
