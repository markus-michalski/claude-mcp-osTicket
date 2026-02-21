import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Shared constants for osTicket MCP Server
 */

// Response size limits
export const CHARACTER_LIMIT = 25000; // Maximum response size in characters

// Pagination defaults
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// API timeouts
export const API_TIMEOUT_MS = 10000; // 10 seconds

// Attachment limits
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB total

// Server info - single source of truth from package.json
export const SERVER_NAME = 'osticket-mcp-server';

function getVersionFromPackageJson(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = join(currentDir, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
    const version = pkg.version;
    // Validate semver format before using
    if (typeof version === 'string' && /^\d+\.\d+\.\d+/.test(version)) {
      return version;
    }
    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const SERVER_VERSION = getVersionFromPackageJson();
