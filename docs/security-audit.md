# Changed-area security audit — 2026-07-15

## Fixed

- **Anonymous administration:** every tRPC route now requires a verified operator session.
- **Credential disclosure:** account list/add/sync responses use an explicit public shape and never include raw credentials.
- **Fail-open upstream:** a missing Antigravity URL no longer validates credentials or returns realistic-looking fallback account data.
- **Browser trust:** the operator password is sent only to the login endpoint and is never stored in `localStorage` or `sessionStorage`.
- **Unbounded login:** repeated failures are throttled in memory.
- **Wildcard CORS:** allowed origins are explicit and production origins must use HTTPS.
- **Cross-origin mutations:** login, logout, and non-GET tRPC requests require a trusted origin.
- **Unsafe screen URLs:** production launch values must be public HTTPS URLs without embedded credentials.
- **Ineffective relay stop:** the asynchronous loop checks the session flag before and after each wait.
- **Spreadsheet injection:** CSV cells beginning with formula characters are neutralized and all fields are quoted.
- **Raw error leakage:** upstream/network failures are converted to stable public messages.
- **Deployment mismatch:** production now serves the correct compiled client path and runs compiled server JavaScript as a non-root user.
- **Missing automated gates:** 22 focused tests, TypeScript/build verification, a security scanner, and Node 20/22 CI are included.

## Residual risks

- Account credentials remain unencrypted in process memory. They are lost on restart but can be exposed by memory compromise.
- State is not durable and cannot safely coordinate multiple replicas.
- Authentication is one shared operator password. There is no MFA, individual identity, role separation, revocation list, or server-side session store.
- Login throttling is in-memory and resets when the process restarts.
- There is no durable audit trail for account, relay, or screen actions.
- Relay and screen controls are simulated state; actual browser automation would introduce additional isolation, authorization, and abuse risks.
- The existing UI loads Google Fonts, creating a third-party request. The CSP allows only the required Google font origins in addition to self.
- The current `node-cron` 3.x dependency brings a transitive `uuid` advisory reported as moderate by npm audit. A supported major upgrade was not committed because a clean install/build could not be completed during network timeouts. CI fails on high-or-critical production advisories, and this moderate item should be resolved in a separately verified dependency update.
- Automated tests do not replace penetration testing or review of the real upstream Antigravity API contract.

## Production gate

Before real multi-account production use, add encrypted durable credential storage, named users with MFA and roles, persistent session/audit storage, per-action authorization and confirmation, rate limiting backed by shared storage, and verified browser-worker isolation.
