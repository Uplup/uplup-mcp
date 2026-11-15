# Uplup MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build & Lint](https://github.com/Uplup/uplup-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Uplup/uplup-mcp/actions/workflows/ci.yml)

Model Context Protocol server for [Uplup](https://uplup.com). Lets Claude, ChatGPT, Cursor, and any other MCP-compatible LLM client read and write your Uplup forms, quizzes, submissions, webhooks, analytics and random name picker wheels through tool calls.

Hosted at `https://mcp.uplup.com/mcp`. Available on every Uplup plan, including Free. Plan-tier limits at the underlying Uplup API still apply (for example, webhooks need Pro or higher).

## Connect from a client

### Claude (web or desktop)

Settings > Connectors > Add custom connector > paste `https://mcp.uplup.com/mcp` > complete the Uplup OAuth flow when prompted.

### ChatGPT (Pro / Team plans)

Settings > Connectors > Custom > paste `https://mcp.uplup.com/mcp` > complete the Uplup OAuth flow.

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

**70 tools** across 10 groups of the Uplup public API:

| Group | Tools |
|---|---|
| Forms (7) | `list_forms`, `get_form`, `create_form`, `update_form`, `delete_form`, `clone_form`, `publish_form` |
| Fields (6) | `list_fields`, `get_field`, `create_field`, `update_field`, `delete_field`, `reorder_fields` |
| Pages (6) | `list_pages`, `add_page`, `update_page`, `delete_page`, `reorder_pages`, `get_logic_summary` |
| Submissions (4) | `list_submissions`, `get_submission`, `delete_submission`, `export_submissions` |
| Analytics (4) | `get_form_analytics`, `get_submission_analytics`, `get_geography_analytics`, `get_performance_analytics` |
| Quiz (4) | `get_quiz_settings`, `update_quiz_settings`, `get_quiz_results`, `get_quiz_leaderboard` |
| Design (5) | `get_form_design`, `update_form_design`, `apply_theme`, `list_themes`, `get_theme` |
| Webhooks (8, Pro or higher) | `list_webhooks`, `create_webhook`, `get_webhook`, `update_webhook`, `delete_webhook`, `test_webhook`, `regenerate_webhook_secret`, `get_webhook_deliveries` |
| Account (1) | `get_account` |
| Wheels (25) | `list_wheels`, `get_wheel`, `create_wheel`, `update_wheel`, `delete_wheel`, `archive_wheel`, `restore_wheel`, `clone_wheel`, `get_wheel_settings`, `update_wheel_settings`, `update_wheel_appearance`, `get_wheel_background`, `set_wheel_background`, `remove_wheel_background`, `get_wheel_entries`, `add_wheel_entries`, `replace_wheel_entries`, `clear_wheel_entries`, `spin_wheel`, `get_wheel_results`, `clear_wheel_results`, `get_wheel_stats`, `get_wheel_embed`, `get_wheel_share_url`, `update_wheel_share` |

Webhooks need a Pro plan or higher, both to create a subscription and for deliveries to be sent, and a workspace can hold at most 25 active webhooks.

**3 resources** for direct LLM inspection:
- `uplup://forms/{form_id}`: full form definition JSON (the list shows one resource per form)
- `uplup://forms/{form_id}/submissions`: the first 100 submissions
- `uplup://templates`: starter field lists (lead form, NPS, product quiz, contact form) to feed `create_form` + `create_field`

**6 guided prompts** that walk an LLM through multi-step tool calls:
- `build_quiz`: a multi-question scored quiz with a pass mark and results display
- `build_lead_form`: a name/email/phone form with one tailored question
- `build_survey`: rating, choice, open-ended and NPS questions
- `analyze_submissions`: analytics plus sampled submissions, surfaced as insights
- `analyze_responses_by_field`: response rate and answer distribution per field from a sample
- `manage_quiz_scoring`: scoring mode, pass mark, retakes, randomization and results display

## Architecture

```
LLM client (Claude, ChatGPT, Cursor)
    |
    |  HTTPS + Streamable HTTP transport, OAuth 2.0 Bearer
    v
mcp.uplup.com  (this repo)
    |
    |  per-request Bearer token forwarded as-is
    v
api.uplup.com  (Uplup's public REST API)
```

The MCP server is a **thin adapter**. It does not store user data, does not maintain credentials, and forwards each authenticated request to `api.uplup.com` so the existing Bearer, scope and plan-gate middleware handles authorization. Sessions are held in memory only for the duration of a client connection (30-minute idle TTL, hard cap of 400 sessions with LRU eviction, sized against PM2's 500M memory restart).

Authentication uses **OAuth 2.0 + PKCE** with [RFC 7591 dynamic client registration](https://datatracker.ietf.org/doc/html/rfc7591) so any MCP client can self-register as a public client without operator action.

### Scopes

Tokens carry `read` or `read write` scope. A read-only token can call every `list_*` / `get_*` tool but not the write tools (create, update, delete, publish, spin, test); the API answers those with 403 "This token has read access only", which the MCP surfaces as a permission error.

### Rate limits

- MCP: 120 requests per minute per IP, enforced before authentication so unauthenticated traffic is throttled too.
- OAuth dynamic client registration: 60 registrations an hour per IP. Token endpoint: 20 requests a minute per IP.
- Upstream API: 600 requests an hour per token, reported in `X-RateLimit-*` headers; a 429 from the API is passed through with its `Retry-After` hint.

The per-IP limiter relies on `trust proxy 1`, which assumes exactly one reverse proxy (Apache) in front of Node. Behind Cloudflare the limiter would key on the Cloudflare edge IP instead of the client; raise the trust-proxy hop count or key on `CF-Connecting-IP` before putting the service behind it.

## Tech stack

- TypeScript (strict) on Node.js 20+
- Express 4 + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) 1.29+ (Streamable HTTP transport)
- Zod input validation on every tool
- Pino structured logging with auth-header redaction (request headers, axios config and response config, raw request header block, token-shaped fields)
- PM2 process manager (single instance for session affinity)
- Apache `mod_proxy_http` reverse proxy with HSTS, `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin` and `Permissions-Policy camera=(), microphone=(), geolocation=()`
- TLS via Let's Encrypt (auto-renewing)
- DNS-rebinding protection: `Origin` allowlist for Claude / ChatGPT / Cursor / mcp.uplup.com / loopback, compared on the exact hostname

## Self-host

```bash
git clone https://github.com/Uplup/uplup-mcp.git
cd uplup-mcp
npm install
cp .env.example .env  # adjust if you want a different upstream API
npm run build
npm start
```

Then connect your LLM client to `http://localhost:3000/mcp`. To use it against a Uplup account you'll need an OAuth access token, obtained either through the public consent flow at `https://uplup.com/oauth/authorize` or by registering a client via the public DCR endpoint described in the [Uplup API docs](https://uplup.com/docs/use-the-uplup-api-and-api-keys).

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
- Bearer tokens are forwarded but never logged (pino redact paths cover request headers, axios error and response config, the raw request header block, and common token-shaped fields).
- Upstream 5xx bodies are never forwarded to the client; the MCP returns a generic "please try again" error.
- See [`SECURITY.md`](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE) (c) Uplup
