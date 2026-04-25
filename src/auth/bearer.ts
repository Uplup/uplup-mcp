import { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    uplupToken?: string;
  }
}

const BEARER_RE = /^Bearer\s+(.+)$/i;
const TOKEN_RE = /^uplup_(at|live|test)_[a-f0-9]{32,64}$/;

export function publicResourceMetadataUrl(): string {
  const base = process.env.MCP_PUBLIC_URL ?? 'https://mcp.uplup.com';
  return `${base.replace(/\/+$/, '')}/.well-known/oauth-protected-resource`;
}

function challengeHeader(): string {
  return `Bearer resource_metadata="${publicResourceMetadataUrl()}", error="invalid_token"`;
}

/**
 * Extracts and shape-validates the Bearer token. Actual validation happens at
 * the Uplup API; this middleware only prevents obvious junk and makes the
 * token available on req.uplupToken for tools to forward.
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
  req.uplupToken = token;
  next();
}
