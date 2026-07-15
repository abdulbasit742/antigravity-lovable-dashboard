# Reference review

Reviewed on 2026-07-15 before hardening the Antigravity control plane.

## Appsmith

Relevant pattern: an administration/data-source product separates authentication services from protected server controllers instead of trusting client-only navigation.

Adopted:

- server-owned identity verification
- protected control-plane procedures
- credentials treated as server-side datasource secrets

Not adopted:

- Appsmith's large Java/Spring authentication stack, OAuth providers, organizations, or plugin framework

## ToolJet

Relevant pattern: a low-code administration surface is organized around authenticated users and access-controlled server resources rather than anonymous mutation endpoints.

Adopted:

- the dashboard is unavailable until the server confirms a session
- logout and expired-session behavior are explicit client states
- account and automation controls share one authorization boundary

Not adopted:

- workspace/organization hierarchy, database-backed user management, SSO, or ToolJet's application framework

## Directus

Relevant pattern: server-side policy and permission enforcement protects administrative data; hiding a route in the UI is not authorization.

Adopted:

- every tRPC procedure enforces authentication
- public response shapes minimize sensitive fields
- trusted origins and bounded inputs are validated at the HTTP boundary

Not adopted:

- granular role policies, database schema, extension SDK, or token/refresh-token infrastructure

## Resulting design

The smallest coherent improvement was a dependency-light operator session using the existing bcrypt dependency and Node cryptography:

- bcrypt password hash from environment configuration
- HMAC-signed, time-limited HttpOnly cookie
- protected tRPC middleware
- explicit safe public account representation
- bounded login, origin, upstream, URL, and export behavior

This is deliberately a single-operator baseline, not a claim of enterprise identity or multi-tenant authorization.
