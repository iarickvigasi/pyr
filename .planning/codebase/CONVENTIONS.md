# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**
- Backend modules: kebab-case (`guest.service.ts`, `guest.routes.ts`, `guest.schema.ts`, `guest.test.ts`)
- Frontend components: kebab-case with feature grouping (`use-guests.ts`, `use-bookings.ts`)
- Database/schema files: kebab-case (`guest.service.ts`, `booking-status.ts`)
- Config files: kebab-case with descriptive context (`error-handler.ts`, `prisma-helpers.ts`)

**Functions:**
- camelCase everywhere: `listGuests()`, `createGuest()`, `getActor()`, `clampLimit()`
- Async functions: same convention, no async prefix (`async function deleteGuest()`)
- Private class methods: prefix with underscore (`private _request()`)

**Variables:**
- camelCase: `guestId`, `roomId`, `totalPrice`, `hasMore`, `nextCursor`
- Boolean flags: start with `is`, `has`, `should`: `isLoading`, `hasMore`, `shouldValidate`
- Constants: UPPER_SNAKE_CASE: `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`

**Types/Interfaces:**
- PascalCase, no `I` prefix: `Guest`, `CreateGuestBody`, `PaginatedResult`, `ApiError`
- Response envelopes: suffix with `Response` or use generic wrapper: `GuestListResponse`
- Zod inferred types: use `z.infer<typeof schema>`: `type CreateGuestBody = z.infer<typeof createGuestSchema>`

**Database columns:**
- snake_case in Prisma schema (`dietary_needs`, `created_at`, `deleted_at`)
- Automatically mapped to camelCase in TypeScript: `dietaryNeeds`, `createdAt`, `deletedAt`

**API endpoints:**
- RESTful, plural nouns: `/api/v1/guests`, `/api/v1/bookings`, `/api/v1/events`
- Path parameters: kebab-case: `/api/v1/guests/:id`, `/api/v1/bookings/:id`
- Query parameters: camelCase: `?search=`, `?cursor=`, `?limit=`

**Environment variables:**
- UPPER_SNAKE_CASE, prefixed by context: `DB_HOST`, `IMAP_HOST`, `JWT_SECRET`, `API_KEY`, `NODE_ENV`, `LOG_LEVEL`, `CORS_ORIGIN`

## Code Style

**Formatting:**
- Tool: Prettier (`.prettierrc.json`)
- Semicolons: enabled (`semi: true`)
- Trailing commas: all (`trailingComma: "all"`)
- Quotes: single quotes (`singleQuote: true`)
- Print width: 100 characters
- Tab width: 2 spaces
- Line endings: LF

**Linting:**
- Tool: ESLint (`.eslintrc.json`)
- Parser: `@typescript-eslint/parser`
- Extends: `eslint:recommended`, `@typescript-eslint/recommended`, `prettier`
- Key rules:
  - `@typescript-eslint/no-unused-vars`: warn (ignore variables starting with `_`)
  - `@typescript-eslint/no-explicit-any`: warn (use `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with comment when unavoidable)
  - `no-console`: warn (allow `console.warn`, `console.error`)
  - Prettier integration: `prettier/prettier` warn

**TypeScript:**
- `strict: true` mode everywhere
- No `any` types unless absolutely necessary (annotate with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` and explain why)
- ESM modules: `"type": "module"` in all `package.json` files
- Explicit return types on all exported functions
- Back-end specific: `explicit-function-return-type` warn with exceptions for typed expressions

## Import Organization

**Order:**
1. External dependencies from `node_modules` (e.g., `import fastify from 'fastify'`)
2. Monorepo workspace imports (e.g., `import { idParamSchema } from '@pyr/shared'`)
3. Relative imports within same package (e.g., `import { listGuests } from './guest.service.js'`)

**Path Aliases:**
- Frontend: `@` = `./src` (e.g., `import { api } from '@/lib/api'`)
- Backend: None currently, uses relative imports
- Shared: `@pyr/shared` = workspace package reference

**File extensions:**
- ESM requires explicit `.js` extensions in imports: `import { buildApp } from '../app.js'`
- TypeScript compilation handles `.ts` → `.js` transformation

## Error Handling

**Patterns:**
- Throw typed error objects with HTTP status codes
- Error classes defined in `src/lib/errors.ts`:
  - `BadRequestError` (400): Invalid request client should fix (bad dates, self-merge, required field missing)
  - `UnauthorizedError` (401): Missing/invalid auth credentials
  - `NotFoundError` (404): Resource doesn't exist or was soft-deleted
  - `ConflictError` (409): Uniqueness or overlap constraint violated (duplicate email, double-booking)
  - `UnprocessableError` (422): Valid request blocked by application state (invalid booking status transition)

**Error handler:**
- Location: `src/lib/error-handler.ts`
- Fastify error handler maps typed errors to JSON responses: `{ error: { code, message, details? } }`
- Never throw raw `Error` — always use typed subclass

**Service functions:**
- Always check preconditions and throw appropriate error
- Use `NotFoundError` for 404 when resource not found
- Use `ConflictError` for uniqueness violations (catch Prisma `P2002` errors)
- Use `BadRequestError` for validation failures during logic (not during request validation)

**Frontend:**
- Custom `ApiError` class in `src/lib/api.ts`: `status`, `code`, `message`
- Throw `ApiError` from API client on 4xx/5xx responses
- Use React Query error handling in component hooks

## Logging

**Framework:** Pino (Fastify's built-in logger)

**Patterns:**
- Access via `app.log` in Fastify handlers/services
- Development: pretty-printed output via `pino-pretty`
- Production: JSON structured logs
- Log level configured via `LOG_LEVEL` env var (default: info)

**Configuration:**
- Automatic Fastify request logging enabled
- Console output: `app.log.info()`, `app.log.warn()`, `app.log.error()`
- Prefer logger over `console.log()` (console methods still allowed for errors)

## Comments

**When to Comment:**
- Complex business logic (e.g., cursor pagination, availability checking)
- Non-obvious design decisions (e.g., soft deletes, why field is nullable)
- Security-sensitive code (e.g., timing-safe password comparison)
- Workarounds and temporary fixes (why they're needed)

**JSDoc/TSDoc:**
- Used on public functions and exported types
- Example: `/** Clamp a user-supplied limit to a safe range (1..100), defaulting to 20. */`
- Example with params: `@example` blocks show usage
- Zod schemas: Use `tags` and `summary` for Swagger documentation

**Avoid:**
- Obvious comments ("increment i")
- Redundant comments (comment says what code already says)
- Commented-out code (use git history instead)

## Function Design

**Size:** Keep functions focused (roughly 20-40 lines of logic)
- Longer functions: extract sub-functions
- Service functions: one responsibility (list, get, create, update, delete)
- Route handlers: delegate to service, handle request/response wrapping only

**Parameters:**
- Use object parameters for functions with 3+ parameters
- Example: `listGuests(prisma, query)` not `listGuests(prisma, search, tag, source, limit, cursor)`
- Factory functions accept `overrides: Record<string, unknown>` for test flexibility

**Return Values:**
- Always explicit return type annotation
- Service functions return typed data: `Guest[]`, `Guest`, `PaginatedResult<Guest>`
- Route handlers wrap in `{ data: T }` response object
- Async functions that delete: return `void` (status code signals success)

**Type narrowing:**
- Use type guards for union types
- Prisma helpers: `notDeleted` where clause for soft-delete filtering
- Example: `where: { ...notDeleted }` excludes deleted records

## Module Design

**Exports:**
- Organize by public API
- Service files export functions, not classes
- Example: `export function listGuests()`, `export function createGuest()`
- Re-export schemas in `index.ts` if needed for widespread use

**Barrel Files:**
- `packages/shared/src/index.ts` re-exports common types, constants, schemas
- Used to avoid deep relative imports: `from '@pyr/shared'` vs `from '@pyr/shared/src/types'`

**Backend Module Structure:**
All feature modules follow identical pattern:
- `<module>.routes.ts`: Fastify plugin, route definitions, Zod type providers
- `<module>.service.ts`: Business logic, database queries via Prisma
- `<module>.schema.ts`: Zod request/response validation schemas
- `<module>.test.ts`: Vitest integration tests (API endpoint tests)

**Never in route files:**
- Direct Prisma queries (use service layer)
- Business logic
- Complex data transformations

**Service layer always:**
- Takes `PrismaClient` as first parameter
- Wraps multi-table mutations in `prisma.$transaction()`
- Calls `writeAuditLog()` for all create/update/delete operations
- Throws typed errors, never raw `Error`

## Frontend Component Conventions

**Directory structure:**
- `components/ui/`: shadcn/ui primitives (auto-generated, don't modify)
- `components/features/`: Feature-specific components that compose `ui/` primitives
- `lib/`: API client, hooks, utilities, formatting, query keys
- `types/`: TypeScript interfaces and enums
- `app/`: Next.js App Router pages

**Hooks:**
- Custom hooks: `useXxx` naming (`useGuests`, `useCreateGuest`, `useAuth`)
- React Query hooks: use `useQuery`, `useMutation` with query keys
- Re-export from `lib/hooks/` or `lib/api.ts`

**API client:**
- Location: `src/lib/api.ts`
- Methods: `get<T>()`, `post<T>()`, `patch<T>()`, `put<T>()`, `delete<T>()`
- Handles: auth headers, parameter filtering, error responses
- Returns: typed response or throws `ApiError`

**State management:**
- React Query for server state (`@tanstack/react-query`)
- Context for UI state (theme, auth, modal visibility)
- No Redux/Zustand in MVP

---

*Convention analysis: 2026-02-19*
