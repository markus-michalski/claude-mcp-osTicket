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

// Server info
export const SERVER_NAME = 'osticket-mcp-server';
export const SERVER_VERSION = '3.0.0'; // Major version bump for MCP best practices refactor
