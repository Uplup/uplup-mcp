# Security Policy

## Reporting a vulnerability

If you discover a security issue in the Uplup MCP server, **do not open a public GitHub issue**.

Email **hello@uplup.com** with:
- A description of the issue.
- Steps to reproduce (or a proof-of-concept).
- The version / commit SHA you observed it against.
- Your contact details if you would like credit.

We will acknowledge receipt within 2 business days and aim to provide a fix or mitigation within 14 days for high-severity issues.

## Scope

- The hosted instance at `https://mcp.uplup.com/mcp`.
- The source code in this repository.

Out of scope:
- Issues that require physical access to a user's machine.
- Issues in third-party LLM clients (Claude, ChatGPT, Cursor) — please report to the vendor.
- Denial-of-service via legitimate but high-volume traffic — we already enforce rate limits.

## Hardening already in place

- OAuth 2.0 + PKCE for public (DCR-registered) clients; PKCE verifier required on the token endpoint.
- Bearer tokens shape-validated before forwarding; never logged (pino redact).
- Per-IP rate limits at the MCP and at the dynamic client registration endpoint.
- DNS-rebinding protection via Origin allowlist (Claude / ChatGPT / Cursor / localhost).
- Session token binding: a request with a valid `mcp-session-id` but a different Bearer token is rejected with 401.
- Hard cap on simultaneous sessions (5,000) with LRU eviction to bound memory.
- HTTPS-only with HSTS (max-age 1 year), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera/mic/geo disabled.
- Top-level Express error handler returns generic JSON; no stack traces leak.
- Daily cleanup of stale dynamically-registered public clients.

## Known limitations

- The MCP server forwards Bearer tokens to `https://api.uplup.com`. Authorization is enforced by the upstream API (existing per-endpoint plan-tier gates apply).
- This server is a thin adapter — it does not perform additional authorization checks beyond shape validation and forwarding.
