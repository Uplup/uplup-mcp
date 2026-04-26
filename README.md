# Uplup MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build & Lint](https://github.com/Uplup/uplup-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Uplup/uplup-mcp/actions/workflows/ci.yml)

Model Context Protocol server for [Uplup](https://uplup.com). Lets Claude, ChatGPT, Cursor, and any other MCP-compatible LLM client read and write your Uplup forms, quizzes, submissions, webhooks, and analytics through tool calls.

Hosted at `https://mcp.uplup.com/mcp`. Available on every Uplup plan, including Free. Plan-tier limits at the underlying Uplup API still apply (e.g. webhooks require Pro).

## Connect from a client

### Claude (web or desktop)

Settings → Connectors → Add custom connector → paste `https://mcp.uplup.com/mcp` → complete the Uplup OAuth flow when prompted.

### ChatGPT (Pro / Team plans)

Settings → Connectors → Custom → paste `https://mcp.uplup.com/mcp` → complete the Uplup OAuth flow.

### Cursor / VS Code (with an MCP-compatible extension)

Add to your MCP config:

```json
{
  "mcpServers": {
    "uplup": {
      "url": "https://mcp.uplup.com/mcp"
    }
  }
}
```

Reload the editor; the first tool call opens an OAuth consent window.

## What it exposes

**35 tools** across 8 resources of the Uplup public API:

| Group | Tools |
|---|---|
| Forms | `list_forms`, `get_form`, `create_form`, `update_form`, `delete_form`, `clone_form`, `publish_form` |
| Fields | `list_fields`, `create_field`, `update_field`, `delete_field`, `reorder_fields` |
| Submissions | `list_submissions`, `get_submission`, `delete_submission`, `export_submissions` |
| Analytics | `get_form_analytics`, `get_submission_analytics`, `get_geography_analytics`, `get_performance_analytics` |
| Quiz | `get_quiz_settings`, `update_quiz_settings`, `get_quiz_results`, `get_quiz_leaderboard` |
| Webhooks (Pro+) | `list_webhooks`, `create_webhook`, `get_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`, `get_webhook_deliveries` |
| Account | `get_account` |
| Design | `get_form_design`, `update_form_design`, `list_themes` |

**3 resource templates** for direct LLM inspection:
- `uplup://forms/{form_id}` — full form definition JSON
- `uplup://forms/{form_id}/submissions` — paginated submissions
- `uplup://templates` — starter templates (lead form, NPS, product quiz, contact form)

**3 guided prompts** that walk an LLM through multi-step tool calls:
- `build_quiz` — produces a multi-question quiz with scoring and outcomes
- `build_lead_form` — produces a name/email/phone form with one tailored question
- `analyze_submissions` — pulls analytics + sample submissions, surfaces actionable insights

## Architecture

```
LLM client (Claude, ChatGPT, Cursor)
    │
    │  HTTPS + Streamable HTTP transport, OAuth 2.0 Bearer
    ▼
mcp.uplup.com  (this repo)
    │
    │  per-request Bearer token forwarded as-is
    ▼
api.uplup.com  (Uplup's public REST API)
```

The MCP server is a **thin adapter**. It does not store user data, does not maintain credentials, and forwards each authenticated request to `api.uplup.com` so the existing Bearer/plan-gate middleware handles authorization. Sessions are held in memory only for the duration of a client connection (30-minute idle TTL, hard cap at 5,000 sessions).

Authentication uses **OAuth 2.0 + PKCE** with [RFC 7591 dynamic client registration](https://datatracker.ietf.org/doc/html/rfc7591) so any MCP client can self-register as a public client without operator action.

## Tech stack

- TypeScript (strict) on Node.js 20+
- Express + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) — Streamable HTTP transport
- Zod input validation on every tool
- Pino structured logging with auth-header redaction
- PM2 cluster manager (single instance for session affinity)
- Apache `mod_proxy_http` reverse proxy with HSTS + `X-Frame-Options DENY` + `X-Content-Type-Options nosniff` + `Referrer-Policy strict-origin-when-cross-origin` + `Permissions-Policy camera=(), microphone=(), geolocation=()`
- TLS via Let's Encrypt (auto-renewing)
- DNS-rebinding protection: `Origin` allowlist for Claude / ChatGPT / Cursor / mcp.uplup.com
- Rate limits: 120 req/min/IP at the MCP, 5 client-registrations/hour/IP at the OAuth registration endpoint

## Self-host

```bash
git clone https://github.com/Uplup/uplup-mcp.git
cd uplup-mcp
npm install
cp .env.example .env  # adjust if you want a different upstream API
npm run build
npm start
```

Then connect your LLM client to `http://localhost:3000/mcp`. To use it against a Uplup account you'll need an OAuth access token, obtained either through the public consent flow at `https://uplup.com/oauth/authorize` or by registering a client via the public DCR endpoint described in the [`Uplup OAuth docs`](https://uplup.com/docs/api).

For production deploys, replace `npm start` with PM2 (`ecosystem.config.cjs` is included as a reference) and front the Node app with a reverse proxy.

## Development

```bash
npm install
npm run dev      # tsx watch
npm run build    # tsc strict
npm run lint     # eslint
```

CI runs build + lint on every push and PR. The deploy workflow (`.github/workflows/deploy.yml`) is specific to the hosted instance at `mcp.uplup.com` and is the recommended pattern for self-hosters who want git-push-to-deploy behavior.

## Security

- No secrets in this repo or its git history.
- All tool inputs validated by zod schemas before forwarding upstream.
- Bearer tokens are forwarded but never logged (pino redact paths cover headers, axios error config, and common token-shaped fields).
- See [`SECURITY.md`](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE) © Uplup
