import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { buildMcpServer } from './mcp/buildServer.js';
import { bearerAuth, publicResourceMetadataUrl } from './auth/bearer.js';
import { log } from './util/log.js';
import { SERVER_NAME, SERVER_VERSION } from './util/version.js';

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? 'https://mcp.uplup.com';
const UPLUP_API_BASE_URL = process.env.UPLUP_API_BASE_URL ?? 'https://api.uplup.com';
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes idle
const SESSION_HEADER = 'mcp-session-id';
// Hard cap on simultaneous sessions to bound memory under abuse. PM2 restarts
// the process at 500M (max_memory_restart in ecosystem.config.cjs). Each
// session holds a transport plus a fully registered McpServer, roughly 1MB,
// so 400 sessions keeps the session pool well inside that ceiling with room
// for the rest of the heap before LRU eviction kicks in.
const MAX_SESSIONS = 400;

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  token: string;
  lastSeen: number;
}

const sessions = new Map<string, Session>();

function closeSession(id: string, s: Session): void {
  sessions.delete(id);
  s.transport.close().catch(() => undefined);
  s.server.close().catch(() => undefined);
}

function purgeStaleSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) {
    if (s.lastSeen < cutoff) closeSession(id, s);
  }
}

/** Evict the least-recently-seen session. Called when at MAX_SESSIONS. */
function evictOldestSession(): void {
  let oldestId: string | undefined;
  let oldestSeen = Infinity;
  for (const [id, s] of sessions) {
    if (s.lastSeen < oldestSeen) {
      oldestSeen = s.lastSeen;
      oldestId = id;
    }
  }
  if (oldestId) {
    const s = sessions.get(oldestId)!;
    closeSession(oldestId, s);
  }
}
setInterval(purgeStaleSessions, 60_000).unref();

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

// DNS rebinding protection: validate Origin header for browser-originated calls.
// Compare the hostname (no port) exactly. WHATWG URL keeps the brackets on an
// IPv6 hostname ("[::1]"), so strip them before comparing.
const ALLOWED_ORIGIN_HOST = new URL(MCP_PUBLIC_URL).hostname;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function originHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
}

app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin) {
    const hostname = originHostname(origin);
    if (!hostname) {
      res.status(400).json({ error: 'invalid_origin' });
      return;
    }
    const isLocal = LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost');
    const isAllowedHost =
      hostname === ALLOWED_ORIGIN_HOST ||
      hostname === 'claude.ai' ||
      hostname.endsWith('.claude.ai') ||
      hostname === 'chat.openai.com' ||
      hostname === 'chatgpt.com' ||
      hostname.endsWith('.chatgpt.com') ||
      hostname === 'cursor.sh' ||
      hostname.endsWith('.cursor.sh');
    if (!isLocal && !isAllowedHost) {
      res.status(403).json({ error: 'origin_not_allowed', origin });
      return;
    }
  }
  next();
});

// Per-IP token bucket. Runs as Express middleware BEFORE bearerAuth so that
// unauthenticated traffic (bad or missing tokens) is throttled too and cannot
// turn into a stream of upstream verification calls. Buckets are pruned every
// 5 minutes to bound memory growth from IP-rotation attacks.
//
// `trust proxy` is 1, which assumes exactly one reverse proxy (Apache) in
// front of Node. Behind Cloudflare the client IP would be the edge IP; set
// trust proxy accordingly (or key on CF-Connecting-IP) before putting the
// service behind it, otherwise the limiter would throttle whole edge POPs.
const buckets = new Map<string, { tokens: number; last: number }>();
const RATE_LIMIT = 120;
const RATE_REFILL_PER_SEC = 2;
const BUCKET_IDLE_MS = 5 * 60 * 1000;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: RATE_LIMIT, last: now };
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(RATE_LIMIT, b.tokens + elapsed * RATE_REFILL_PER_SEC);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  return true;
}

function pruneIdleBuckets(): void {
  const cutoff = Date.now() - BUCKET_IDLE_MS;
  for (const [ip, b] of buckets) {
    if (b.last < cutoff) buckets.delete(ip);
  }
}
setInterval(pruneIdleBuckets, 60_000).unref();

function rateLimitMiddleware(req: Request, res: Response, next: express.NextFunction): void {
  const ip = req.ip ?? 'unknown';
  if (!rateLimit(ip)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: SERVER_NAME, version: SERVER_VERSION, sessions: sessions.size });
});

app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    resource: MCP_PUBLIC_URL,
    authorization_servers: [`${UPLUP_API_BASE_URL}`],
    scopes_supported: ['read', 'write'],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://uplup.com/docs/mcp',
  });
});

async function handleMcp(req: Request, res: Response): Promise<void> {
  const token = req.uplupToken;
  if (!token) {
    res.status(500).json({ error: 'auth_middleware_misconfigured' });
    return;
  }

  const sessionId = req.header(SESSION_HEADER);
  let session: Session | undefined = sessionId ? sessions.get(sessionId) : undefined;

  // Bind a session to its initiating token. Reject token mismatch on existing sessions.
  if (session && session.token !== token) {
    res.status(401).json({ error: 'session_token_mismatch' });
    return;
  }

  const isInit = req.method === 'POST' && isInitializeRequest(req.body);

  if (!session) {
    if (req.method === 'POST' && !isInit) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'No session: client must initialize first.' },
        id: null,
      });
      return;
    }
    if (req.method === 'GET' || req.method === 'DELETE') {
      res.status(404).json({ error: 'unknown_session' });
      return;
    }

    // Hard cap on simultaneous sessions; evict the LRU one if at the cap.
    if (sessions.size >= MAX_SESSIONS) {
      log.warn({ size: sessions.size, cap: MAX_SESSIONS }, 'session_cap_reached_evicting_lru');
      evictOldestSession();
    }

    const newId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newId,
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });
    const server = buildMcpServer(token);
    await server.connect(transport);
    session = { transport, server, token, lastSeen: Date.now() };
    sessions.set(newId, session);
  }

  session.lastSeen = Date.now();

  try {
    await session.transport.handleRequest(req, res, req.body);
  } catch (err) {
    log.error({ err }, 'mcp_request_failed');
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error' });
    }
  }
}

// Order matters: rate limit first, then auth, then the MCP transport.
app.post('/mcp', rateLimitMiddleware, bearerAuth, handleMcp);
app.get('/mcp', rateLimitMiddleware, bearerAuth, handleMcp);
app.delete('/mcp', rateLimitMiddleware, bearerAuth, handleMcp);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Top-level error handler. Catches body-parser errors (PayloadTooLargeError,
// invalid JSON, etc.) and any other unhandled middleware error. Returns a
// generic JSON message instead of Express's default HTML stack trace.
app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  log.error({ err, status }, 'unhandled_express_error');
  if (status === 413) {
    res.status(413).json({ error: 'payload_too_large' });
  } else if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json' });
  } else {
    res.status(status).json({ error: 'internal_error' });
  }
});

app.listen(PORT, () => {
  log.info({ port: PORT, public_url: MCP_PUBLIC_URL }, 'uplup-mcp listening');
  log.info({ resource_metadata: publicResourceMetadataUrl() }, 'oauth metadata advertised');
});
