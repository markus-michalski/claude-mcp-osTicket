import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Application Configuration (API-Only Architecture)
 * Loads and validates environment variables for REST API integration
 */
export class Configuration {
  // osTicket API Settings (REQUIRED)
  public readonly osTicketApiUrl: string;
  public readonly osTicketApiKey: string;
  public readonly osTicketApiRejectUnauthorized: boolean;

  // Default User for Ticket Creation (optional)
  public readonly osTicketDefaultName: string;
  public readonly osTicketDefaultEmail: string;
  public readonly osTicketDefaultTopicId: number;

  // Logging
  public readonly logLevel: string;

  constructor() {
    // Load .env file from deployment directory (not CWD!)
    const envPath = join(homedir(), '.claude', 'mcp-servers', 'osticket', '.env');
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath });
    } else {
      // Fallback to CWD for development
      dotenv.config();
    }

    // osTicket API Configuration (REQUIRED)
    this.osTicketApiUrl = this.getRequired('OSTICKET_API_URL');
    this.osTicketApiKey = this.getRequired('OSTICKET_API_KEY');
    this.osTicketApiRejectUnauthorized = this.get('OSTICKET_API_REJECT_UNAUTHORIZED', 'true') === 'true';

    // Default User for Ticket Creation (optional)
    this.osTicketDefaultName = this.get('OSTICKET_DEFAULT_NAME', '');
    this.osTicketDefaultEmail = this.get('OSTICKET_DEFAULT_EMAIL', '');
    const topicIdRaw = this.get('OSTICKET_DEFAULT_TOPIC_ID', '0');
    const topicIdParsed = parseInt(topicIdRaw, 10);
    if (isNaN(topicIdParsed)) {
      throw new Error(`Invalid OSTICKET_DEFAULT_TOPIC_ID: "${topicIdRaw}" is not a valid number`);
    }
    this.osTicketDefaultTopicId = topicIdParsed;

    // Logging
    this.logLevel = this.get('LOG_LEVEL', 'info');

    // Validate configuration
    this.validate();
  }

  /**
   * Get environment variable with default
   */
  private get(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
  }

  /**
   * Get required environment variable
   */
  private getRequired(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  /**
   * Validate configuration
   */
  private validate(): void {
    // Validate API URL format and enforce HTTPS
    try {
      const parsedUrl = new URL(this.osTicketApiUrl);
      const allowHttp = process.env.ALLOW_HTTP === 'true';
      if (parsedUrl.protocol === 'http:' && !allowHttp) {
        throw new Error(
          'OSTICKET_API_URL must use HTTPS to protect API credentials in transit. ' +
          'Set ALLOW_HTTP=true only for local development.'
        );
      }
    } catch (e) {
      // Re-throw our own HTTPS enforcement error
      if (e instanceof Error && e.message.includes('must use HTTPS')) throw e;
      throw new Error(`Invalid OSTICKET_API_URL: ${this.osTicketApiUrl}`);
    }

    // Warn when TLS certificate verification is disabled
    if (!this.osTicketApiRejectUnauthorized) {
      const msg = 'WARNING: SSL certificate verification is DISABLED (OSTICKET_API_REJECT_UNAUTHORIZED=false). This allows MITM attacks.';
      process.stderr.write(`[Config] ${msg}\n`);
    }

    // Validate API Key is not empty
    if (!this.osTicketApiKey || this.osTicketApiKey.trim().length === 0) {
      throw new Error('OSTICKET_API_KEY cannot be empty');
    }

    // Defense-in-depth: prevent CRLF injection in API key (header injection)
    if (/[\r\n]/.test(this.osTicketApiKey)) {
      throw new Error('OSTICKET_API_KEY must not contain newline characters');
    }

    // Validate default email format if provided
    if (this.osTicketDefaultEmail && !this.isValidEmail(this.osTicketDefaultEmail)) {
      throw new Error(`Invalid OSTICKET_DEFAULT_EMAIL format: ${this.osTicketDefaultEmail}`);
    }
  }

  /**
   * Simple email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Log configuration (without sensitive data)
   */
  public logSummary(): void {
    // Use stderr to avoid corrupting MCP JSON-RPC transport on stdout
    const log = (msg: string) => process.stderr.write(msg + '\n');
    log('[Config] Loaded configuration:');
    log(`  API URL: ${this.osTicketApiUrl}`);
    log(`  API Key: ${this.osTicketApiKey ? '[SET]' : '[NOT SET]'}`);
    log(`  Reject Unauthorized SSL: ${this.osTicketApiRejectUnauthorized}`);
    log(`  Default User: ${this.osTicketDefaultName || '[NOT SET]'} <${this.osTicketDefaultEmail || '[NOT SET]'}>`);
    log(`  Default Topic ID: ${this.osTicketDefaultTopicId || '[NOT SET]'}`);
    log(`  Log Level: ${this.logLevel}`);
  }
}
