# Uplup MCP Server

Model Context Protocol server for [Uplup](https://uplup.com). Lets Claude, ChatGPT, Cursor, and any other MCP-compliant LLM client read and write your Uplup forms, submissions, webhooks, and analytics through tool calls.

Hosted at `https://mcp.uplup.com/mcp`.

## Connect from a client

### Claude (Desktop or Web)

Settings → Connectors → Add custom connector → URL: `https://mcp.uplup.com/mcp`. Authenticate via Uplup OAuth when prompted.

### ChatGPT (Pro plan)

Settings → Connectors → Custom → URL: `https://mcp.uplup.com/mcp`.

### Cursor / VS Code

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

## What it exposes

35 tools covering forms, fields, submissions, analytics, quiz, webhooks, account, and design. 3 resources for direct form/submission/template inspection. 3 guided prompts (build a quiz, build a lead form, analyze submissions).

Plan gates from your Uplup account apply: Free can read and create forms, Pro+ unlocks webhooks and higher API limits.

## Self-host

```bash
git clone https://github.com/uplup/uplup-mcp.git
cd uplup-mcp
npm install
cp .env.example .env
npm run build
npm start
```

Required env vars are listed in `.env.example`.

## License

MIT
