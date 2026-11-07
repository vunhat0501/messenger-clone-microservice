# Repository Guide for Coding Agents

## Scope and working approach

This file applies to the entire repository. Follow any more specific `AGENTS.md` in the directory you modify.

- Read the relevant implementation and package scripts before editing. The README still contains template setup instructions; use the current source and configuration to establish actual behavior.
- Keep changes focused on the request and preserve unrelated work in the working tree.
- Follow nearby code conventions. Avoid broad renames, dependency upgrades, formatting changes, or architecture changes unless required by the task.
- Complete the implementation and appropriate validation. Report changed behavior, checks run, and any checks blocked by existing configuration or missing infrastructure.

## Project and architecture

This is a social media application in a pnpm workspace managed by Turborepo.

| Location                     | Responsibility                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web`                   | Next.js 16 App Router frontend with React 19, Tailwind CSS 4, Zustand, Axios, and Socket.IO client. |
| `apps/api/apps/api`          | NestJS HTTP and Socket.IO gateway; routes requests to backend microservices.                        |
| `apps/api/apps/auth-service` | NestJS identity, authentication, and user service; PostgreSQL persistence through TypeORM.          |
| `apps/api/apps/chat-service` | NestJS conversation and messaging service; MongoDB persistence through Mongoose.                    |
| `packages/ui`                | Shared shadcn/ui and Radix components, hooks, utilities, and global styles.                         |
| `packages/types`             | Shared TypeScript contracts and runtime enums, including `Role`.                                    |
| `packages/eslint-config`     | Shared ESLint and Prettier configuration.                                                           |
| `packages/typescript-config` | Shared TypeScript configurations.                                                                   |
| `packages/jest-config`       | Shared Jest configurations, compiled before consumption.                                            |
| `docker-compose.yml`         | Local PostgreSQL, MongoDB, RabbitMQ, Redis, and Nginx services.                                     |
| `nginx.conf`                 | Proxy configuration for gateway instances on ports 8008 and 8009, including Socket.IO.              |
| `erd.md`                     | Database model documentation. Update it when changing documented entities or schemas.               |

The gateway communicates with the auth and chat services over RabbitMQ using `auth_queue` and `chat_queue`. Redis backs the Socket.IO adapter for communication across gateway instances. Keep persistence logic in the service that owns the data.

## Tooling and commands

Use Node.js 20 or later and pnpm 10.4.1, as declared in the root `package.json`. Use pnpm rather than creating npm or Yarn lockfiles. Run the following commands from the repository root unless stated otherwise. On Windows PowerShell, use `pnpm.cmd` if execution policy blocks the `pnpm.ps1` shim.

| Purpose                                       | Command                                                         |
| --------------------------------------------- | --------------------------------------------------------------- |
| Install dependencies                          | `pnpm install`                                                  |
| Build shared contracts                        | `pnpm --filter @workspace/types build`                          |
| Build shared test configuration               | `pnpm --filter @workspace/jest-config build`                    |
| Start frontend                                | `pnpm --filter web dev`                                         |
| Start all backend applications                | `pnpm --filter api dev`                                         |
| Start the entire workspace                    | `pnpm dev`                                                      |
| Build frontend                                | `pnpm --filter web build`                                       |
| Build all three NestJS applications           | `pnpm --filter api build`                                       |
| Build workspace with dependency ordering      | `pnpm build`                                                    |
| Check frontend types                          | `pnpm --filter web typecheck`                                   |
| Lint frontend                                 | `pnpm --filter web lint`                                        |
| Lint shared UI                                | `pnpm --filter @workspace/ui lint`                              |
| Lint backend without rewriting files          | `pnpm --filter api exec eslint "apps/**/*.ts"`                  |
| Run frontend tests once                       | `pnpm --filter web test --runInBand`                            |
| Run backend tests using package configuration | `pnpm --filter api exec jest --config package.json --runInBand` |
| Check formatting of selected files            | `pnpm exec prettier --check <files>`                            |
| Format selected files                         | `pnpm exec prettier --write <files>`                            |

- Build `@workspace/types` after changing shared enums or exports: its entry points resolve to `dist`. Build `@workspace/jest-config` before running tests that import it on a fresh checkout.
- Prefer package-scoped commands while working. Run broader builds when shared packages or cross-service contracts change.
- The backend `predev` script stops processes using ports 8008 and 8009, then builds the gateway. Inspect running processes before using this script in a shared environment.
- For individual services without the backend `predev` hook, use `pnpm --filter api exec nest start api --watch`, `pnpm --filter api exec nest start auth-service --watch`, or `pnpm --filter api exec nest start chat-service --watch`.
- The backend `lint` script includes `--fix`, and root `pnpm format` rewrites files across the repository. Prefer the scoped commands above and review any automatic changes.
- Do not assume a root typecheck command exists: `apps/web` declares `typecheck`, while Turbo currently declares a separate `check-types` task.

## Configuration and local infrastructure

- Backend environment validation lives in `apps/api/apps/api/src/config/env.config.ts`. It loads the root `.env` relative to the backend working directory (`apps/api`); use the package commands to preserve that working directory.
- Required backend connection variables include `DATABASE_URL`, `MONGO_URI`, `RABBITMQ_URL`, and `REDIS_URL`. JWT and refresh-token settings are defined in the same validator.
- Frontend environment validation lives in `apps/web/config/env.config.ts`. `NEXT_PUBLIC_BACKEND_URL` defaults to `http://localhost:8008`.
- Keep secrets out of source, logs, test fixtures, and responses. Only expose browser-safe values through `NEXT_PUBLIC_*` variables.
- Use the Compose service names `postgres`, `mongo`, `rabbitmq`, `redis`, and `nginx` when managing local infrastructure. Check whether a service is already running before starting another instance.
- Do not drop schemas, remove persistent volumes, or reset databases as a routine troubleshooting step. Confirm the intended database and data impact before destructive operations.

## Backend conventions

- Follow NestJS modules, controllers, services, DTOs, dependency injection, guards, filters, and interceptors already used by each application.
- Keep HTTP/WebSocket transport handling in the gateway and business logic in the owning microservice. Register new providers and controllers in their modules.
- Update both producers and consumers when changing RabbitMQ message patterns or payloads. Inspect the matching gateway and microservice controllers together.
- Use DTO validation for new inbound payloads. Global `ValidationPipe` enables transformation, whitelisting, and rejection of non-whitelisted properties.
- Preserve the HTTP response envelope created by `TransformInterceptor` (`{ data: ... }`) and the existing exception mapping. Coordinate response changes with frontend callers and proxy handlers.
- Check the relevant auth guards, strategies, and role decorators when changing protected routes. Derive identity from validated authentication and verify authorization for user-specific or conversation-specific actions.
- Preserve Socket.IO event and payload contracts across the gateway and frontend. Current events include `joinConversation`, `leaveConversation`, `sendMessage`, `newMessage`, and `conversationUpdated`.
- Backend aliases are `@/*` for gateway source, `@auth/*` for auth-service source, and `@chat/*` for chat-service source. Existing files also use `apps/...` imports; follow local usage and account for test resolution.

## Database changes

- PostgreSQL entities are in `apps/api/apps/auth-service/src/auth/entities` and `apps/api/apps/auth-service/src/user/entities`. MongoDB schemas are in `apps/api/apps/chat-service/src/database/schemas`.
- `users.id` is a numeric PostgreSQL ID. MongoDB conversation and message `_id` values are ObjectIds. Keep these distinct when validating, serializing, and querying data.
- `participants` is an embedded array in conversations with `_id: false`, not a standalone collection. User IDs stored in MongoDB are logical references across services, not enforced PostgreSQL foreign keys.
- Account deletion uses `users.deleted_at` for soft deletion. `auth.user_id` has a cascade on physical deletion; do not assume it also runs for soft deletion or removes MongoDB data.
- Preserve indexes, uniqueness, nullability, defaults, and existing naming mappings when changing entities or schemas. Consider existing records before introducing required fields or unique indexes.
- Never enable TypeORM `synchronize` in production. Runtime PostgreSQL configuration currently enables it outside production; take care when starting a service against an existing database.
- Migration and seed scripts in `apps/api/package.json` still reference `src/database/...`, while the implementation resides under `apps/auth-service/src/database`. Inspect and reconcile the script paths, data-source imports, and factory paths before using them. Do not claim that these scripts work without validation.

## Frontend conventions

- Use App Router pages, layouts, and route handlers under `apps/web/app`. Preserve route groups such as `(protected)` and the existing authentication layouts.
- Keep server components as the default. Add `'use client'` only where hooks, browser APIs, interactive state, or client libraries require it.
- Reuse `@workspace/ui/components/*`, shared styles, and `cn` from the shared UI utilities before adding new primitives. Keep feature-specific components near their routes and generally reusable components in `packages/ui`.
- Use `apps/web/lib/api.ts` for existing browser API calls. It targets `/api`, sends credentials, and coordinates refresh requests after a 401 response.
- Inspect `app/api` route handlers when changing backend integration: they proxy requests and manage authentication cookies. Preserve HttpOnly cookie handling, sign-out behavior, and refresh retry limits.
- Keep authentication state consistent with `store/useAuthStore.ts` and the auth provider. Prefer shared contracts from `@workspace/types` for data used by both applications.
- Match the surrounding naming conventions; the repository contains both kebab-case files and PascalCase chat components. Avoid renaming unrelated files for consistency.
- Provide accessible labels, keyboard interaction, and loading, empty, and error states when changing interactive views.

## Validation and known configuration issues

- Run checks appropriate to the changed behavior. For backend changes, use focused Jest specs and the backend build. For frontend changes, use typecheck, lint, relevant tests, and a build when routing or server integration changes.
- Add or update meaningful regression tests for behavior changes. Use NestJS testing utilities for backend tests and React Testing Library for frontend tests, following nearby examples.
- The backend has both `jest.config.ts` and a `jest` section in `package.json`. Select a configuration explicitly. The shared Nest preset currently uses `rootDir: 'src'`, which does not match this backend's `apps/` layout; the package configuration targets `apps/` but its `@/` mapper also differs from `tsconfig.json`. Inspect alias resolution when a test fails to load.
- The backend `test:e2e` script targets the gateway suite only. Auth and chat also have their own `test/jest-e2e.json` files. Inspect each suite's setup and infrastructure needs before invoking it.
- Existing tests may be scaffolded or out of sync with dependency injection. Distinguish existing failures from regressions introduced by the change, and report the actual command and failure.
- Do not use production services to satisfy tests. Use mocks for unit tests and an explicitly configured local/test environment for integration checks.
- Documentation-only edits need formatting and content review; they do not require starting services or running application tests.
- Before finishing, review the diff for unrelated edits, generated output, and secrets. Summarize validation honestly; do not describe unexecuted checks as passing.
