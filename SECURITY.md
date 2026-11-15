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
- Issues in third-party LLM clients (Claude, ChatGPT, Cursor); please report those to the vendor.
- Denial-of-service via legitimate but high-volume traffic; we already enforce rate limits.

## Hardening already in place

- OAuth 2.0 + PKCE for public (DCR-registered) clients; PKCE verifier required on the token endpoint.
- Bearer tokens shape-validated against the exact upstream formats (`uplup_at_` + 64 hex, `uplup_live_` / `uplup_test_` + 32 hex) before forwarding; never logged (pino redact).
- Per-IP rate limiting at the MCP runs before authentication, so unauthenticated and malformed requests are throttled too and cannot be turned into a stream of upstream verification calls. The OAuth endpoints have their own per-IP limits (60 client registrations an hour, 20 token requests a minute).
- Token verification results are cached for 60 seconds, and so are rejections: a token upstream refused is answered 401 locally for that window instead of hitting the API again.
- DNS-rebinding protection via an Origin allowlist (Claude / ChatGPT / Cursor / mcp.uplup.com / loopback). The check compares the exact hostname, so `127.0.0.1.attacker.example` does not pass as loopback.
- Session token binding: a request with a valid `mcp-session-id` but a different Bearer token is rejected with 401.
- Hard cap on simultaneous sessions (400) with LRU eviction to bound memory, sized against the PM2 `max_memory_restart` of 500M.
- Scopes are enforced upstream: a read-only token cannot call write tools (403 from the API).
- HTTPS-only with HSTS (max-age 1 year), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera/mic/geo disabled.
- Top-level Express error handler returns generic JSON; no stack traces leak. Upstream 5xx bodies are not forwarded to clients.
- The API's hourly OAuth cleanup job deletes expired authorization codes and revoked or expired tokens.

## Known limitations

- The MCP server forwards Bearer tokens to `https://api.uplup.com`. Authorization is enforced by the upstream API (existing per-endpoint scope and plan-tier gates apply).
- This server is a thin adapter: it does not perform additional authorization checks beyond shape validation and forwarding.
- The per-IP limiter trusts one proxy hop (Apache). Behind Cloudflare it would key on the edge IP; adjust `trust proxy` or key on `CF-Connecting-IP` before fronting the service with Cloudflare.
- Dynamically registered OAuth clients are not pruned automatically today.
