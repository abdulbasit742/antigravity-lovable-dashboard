# Antigravity Lovable Dashboard

A React/Vite operator dashboard with an Express + tRPC control plane for account status, relay progress, screen slots, and scheduler visibility.

This repository now treats the dashboard as a sensitive administration surface. Every tRPC procedure requires a signed operator session, account credentials stay server-side, and production startup fails when authentication or upstream configuration is missing.

## Security model

- one server-verified operator password
- signed, time-limited `HttpOnly` + `SameSite=Strict` session cookie
- no password, session token, or account credential in browser storage
- every dashboard tRPC route protected by the server
- account responses explicitly omit raw credentials
- login throttling and trusted-origin checks for mutations
- explicit CORS allowlist instead of wildcard CORS
- bounded JSON bodies, upstream timeouts, response sizes, and stable public errors
- HTTPS-only public screen URLs; loopback HTTP is development-only
- CSV formula-injection protection
- production container runs compiled JavaScript as the non-root `node` user

## Requirements

- Node.js 20 or newer
- an Antigravity-compatible HTTPS API for production

## Local setup

```bash
npm ci --legacy-peer-deps --ignore-scripts
cp .env.example .env
```

Generate the two required authentication values:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" "replace-with-a-long-operator-password"
```

Put the first result in `DASHBOARD_AUTH_SECRET` and the second in `DASHBOARD_ADMIN_PASSWORD_HASH`.

For normal upstream-backed development:

```dotenv
ANTIGRAVITY_API_URL=https://your-trusted-antigravity.example/api
ANTIGRAVITY_MOCK_MODE=false
```

For an explicit local UI demo without an upstream:

```dotenv
ANTIGRAVITY_API_URL=
ANTIGRAVITY_MOCK_MODE=true
```

Demo mode accepts only credentials beginning with `demo_` and is rejected during production startup.

Start both services:

```bash
npm run dev
```

The Vite client runs on port 5173 and proxies same-origin API/tRPC requests to the Express server on port 3000.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run security-check
npm audit --omit=dev --audit-level=high
```

The focused suite contains 22 tests covering configuration, signed sessions, login throttling, upstream failure behavior, HTTP authentication, route protection, credential redaction, safe launch URLs, and CSV export hardening.

## Production deployment

The Docker build:

1. installs from the committed lockfile;
2. builds the Vite client and compiled server;
3. removes development dependencies;
4. copies only the production package, dependencies, and `dist/` output;
5. runs `npm start` as the non-root `node` user.

Railway uses `/health` and the same `npm start` contract. Configure real values through Railway variables or another secret manager. Production requires:

- `DASHBOARD_AUTH_SECRET`
- `DASHBOARD_ADMIN_PASSWORD_HASH`
- `ANTIGRAVITY_API_URL` using HTTPS
- `SESSION_COOKIE_SECURE=true`
- `CORS_ORIGINS` only when a separate trusted frontend origin is intentionally used

## Important limitations

Account credentials and dashboard state are still held in process memory. They disappear on restart and are not suitable for multiple replicas. Before using real accounts at production scale, add encrypted durable storage, per-user identities/roles, MFA, persistent audit logs, and explicit approval records for automation actions.

The relay and screen-wall behavior in this baseline remains simulated state rather than a verified browser automation implementation. Do not present it as completed external execution.

See:

- [Architecture and reference decisions](docs/reference-review.md)
- [Changed-area security audit](docs/security-audit.md)
