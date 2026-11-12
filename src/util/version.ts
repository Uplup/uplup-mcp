import { readFileSync } from 'node:fs';

/**
 * Single source of truth for the server name and version: package.json.
 * The path is resolved relative to this module, so it works both from
 * src/util (tsx in development) and dist/util (compiled output).
 */
function readPackageVersion(): string {
  try {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const pkg = JSON.parse(raw) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const SERVER_NAME = 'uplup-mcp';
export const SERVER_VERSION = readPackageVersion();
