import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { log } from '../util/log.js';

declare module 'express-serve-static-core' {
  interface Request {
    uplupToken?: string;
  }
}

const BEARER_RE = /^Bearer\s+(.+)$/i;
const TOKEN_RE = /^uplup_(at|live|test)_[a-f0-9]{32,64}$/;

// Token validity is verified upstream once and cached for this long. 60s is
// enough to amortize the cost across a chat-burst of tool calls without
// letting a revoked token live too long. Keep a hard cap on entries so an
// attacker spraying junk tokens can't exhaust memory.
const TOKEN_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_MAX = 10_000;
const tokenValidUntil = new Map<string, number>();

const UPLUP_API_BASE_URL =
  process.env.UPLUP_API_BASE_URL?.replace(/\/+$/, '') ?? 'https://api.uplup.com';

export function publicResourceMetadataUrl(): string {
  const base = process.env.MCP_PUBLIC_URL ?? 'https://mcp.uplup.com';
  return `${base.replace(/\/+$/, '')}/.well-known/oauth-protected-resource`;
}

function challengeHeader(error: 'invalid_token' | 'expired_token' = 'invalid_token'): string {
  return `Bearer resource_metadata="${publicResourceMetadataUrl()}", error="${error}"`;
}

function pruneCacheIfFull(): void {
  if (tokenValidUntil.size < TOKEN_CACHE_MAX) return;
  // Drop the oldest 10% by insertion order (Map iteration order is insertion
  // order). Cheaper than tracking LRU for a value that's just a TTL.
  const dropCount = Math.ceil(TOKEN_CACHE_MAX / 10);
  let dropped = 0;
  for (const k of tokenValidUntil.keys()) {
    tokenValidUntil.delete(k);
    if (++dropped >= dropCount) break;
  }
}

/**
 * Verifies the token against the Uplup API by hitting the cheap /account
 * endpoint. Returns true if upstream accepts the token, false on 401/403.
 * Network failures and 5xx are treated as transient and pass through (the
 * actual tool call will surface a clearer error if the API is genuinely down).
 */
async function verifyTokenUpstream(token: string): Promise<boolean> {
  try {
    const res = await axios.get(`${UPLUP_API_BASE_URL}/api/v1/account`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5_000,
      validateStatus: (s) => s >= 200 && s < 600,
    });
    if (res.status === 401 || res.status === 403) return false;
    return true;
  } catch (err) {
    log.warn({ err }, 'token_verify_upstream_unreachable');
    return true;
  }
}

/**
 * Extract, shape-validate, and verify the Bearer token. Verification result
 * is cached so a chat burst doesn't repeatedly hit /account.
 *
 * On a fresh token (or one whose cached validity has lapsed), we make one
 * upstream call. If the API rejects it, we respond HTTP 401 with a
 * WWW-Authenticate header per RFC 6750 / RFC 9728 — that's the signal the
 * MCP client SDK uses to refresh tokens via the OAuth refresh_token grant
 * and retry transparently.
 */
export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.header('authorization') ?? '';
  const m = BEARER_RE.exec(auth);
  if (!m) {
    res.setHeader('WWW-Authenticate', challengeHeader());
    res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token required.' });
    return;
  }
  const token = m[1].trim();
  if (!TOKEN_RE.test(token)) {
    res.setHeader('WWW-Authenticate', challengeHeader());
    res
      .status(401)
      .json({ error: 'invalid_token', error_description: 'Token format not recognized.' });
    return;
  }

  const cachedExpiry = tokenValidUntil.get(token);
  if (cachedExpiry && cachedExpiry > Date.now()) {
    req.uplupToken = token;
    next();
    return;
  }

  void verifyTokenUpstream(token).then((valid) => {
    if (!valid) {
      tokenValidUntil.delete(token);
      res.setHeader('WWW-Authenticate', challengeHeader('expired_token'));
      res.status(401).json({
        error: 'invalid_token',
        error_description: 'Upstream rejected the access token.',
      });
      return;
    }
    pruneCacheIfFull();
    tokenValidUntil.set(token, Date.now() + TOKEN_CACHE_TTL_MS);
    req.uplupToken = token;
    next();
  });
}

/**
 * Drop a token's cached validity so the next request re-verifies. Tools that
 * encounter an upstream 401 mid-session call this — that way a token revoked
 * mid-burst is caught on the very next request instead of waiting up to 60s.
 */
export function invalidateTokenCache(token: string): void {
  tokenValidUntil.delete(token);
}
