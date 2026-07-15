# AGENTS.md

## Scope

These instructions apply to the entire `abdulbasit742/antigravity-lovable-dashboard` repository.

Project: **Antigravity Lovable Dashboard**, a React/Vite client with an Express + tRPC operator control plane.

## Architecture

- `client/src`: browser UI; never stores passwords, sessions, or account credentials
- `server/index.ts`: HTTP, authentication, CORS, security headers, and production static serving
- `server/auth.ts`: signed HttpOnly operator sessions and login throttling
- `server/config.ts`: fail-closed environment validation
- `server/trpc.ts`: protected procedure boundary
- `server/routers.ts`: account, relay, screen, and scheduler control-plane behavior
- `server/antigravityApi.ts`: bounded fixed-endpoint upstream client
- `server/**/*.test.ts`: focused node-environment regression tests

## Commands

Use Node.js 20 or newer and the committed npm lockfile.

```bash
npm ci --legacy-peer-deps --ignore-scripts
npm run typecheck
npm test
npm run build
npm run security-check
npm audit --omit=dev --audit-level=high
```

The complete local gate is `npm run check && npm run security-check`.

## Security rules

1. Every dashboard tRPC procedure must use `protectedProcedure`; health and auth endpoints are the only intended public HTTP surface.
2. Never return or log raw account credentials, operator passwords, session cookies, environment values, or upstream payloads.
3. Keep sessions server-verified and HttpOnly. Do not add browser token/password/credential storage.
4. Keep production fail-closed: real authentication values and an HTTPS upstream URL are required; mock mode is development/test only.
5. Validate origins, body sizes, upstream timeouts/response sizes, launch URLs, CSV exports, and public response schemas at their trust boundaries.
6. Do not turn simulated relay/screen state into external automation without named-user authorization, explicit approval, durable audit events, worker isolation, and abuse controls.
7. Treat account removal, relay start/stop, screen launch/stop, deployment, and live upstream requests as side effects.
8. Keep Docker/Railway on the compiled `npm start` contract and run the production container as a non-root user.

## Completion checklist

- Relevant focused tests pass and the suite remains discoverable through `vitest.config.ts`.
- TypeScript and both client/server production builds pass.
- Security scanner passes and no populated environment file or credential-shaped value is introduced.
- Public account and health responses remain secret-free.
- Authentication, error, loading, empty, success, keyboard, and responsive states are preserved.
- README and audit documentation reflect changed configuration, security boundaries, or residual risks.
