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
    this.osTicketApiRejectUnauthorized = this.get('OSTICKET_API_REJECT_UNAUTHORIZED', 'false') === 'true';

    // Default User for Ticket Creation (optional)
    this.osTicketDefaultName = this.get('OSTICKET_DEFAULT_NAME', '');
    this.osTicketDefaultEmail = this.get('OSTICKET_DEFAULT_EMAIL', '');
    this.osTicketDefaultTopicId = parseInt(this.get('OSTICKET_DEFAULT_TOPIC_ID', '0'));

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
    // Validate API URL format
    try {
      new URL(this.osTicketApiUrl);
    } catch (error) {
      throw new Error(`Invalid OSTICKET_API_URL: ${this.osTicketApiUrl}`);
    }

    // Validate API Key is not empty
    if (!this.osTicketApiKey || this.osTicketApiKey.trim().length === 0) {
      throw new Error('OSTICKET_API_KEY cannot be empty');
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
    console.log('[Config] Loaded configuration:');
    console.log(`  API URL: ${this.osTicketApiUrl}`);
    console.log(`  API Key: ${this.osTicketApiKey ? '***' + this.osTicketApiKey.slice(-4) : 'not set'}`);
    console.log(`  Reject Unauthorized SSL: ${this.osTicketApiRejectUnauthorized}`);
    console.log(`  Default User: ${this.osTicketDefaultName ? this.osTicketDefaultName : 'not set'} <${this.osTicketDefaultEmail ? this.osTicketDefaultEmail : 'not set'}>`);
    console.log(`  Default Topic ID: ${this.osTicketDefaultTopicId || 'not set'}`);
    console.log(`  Log Level: ${this.logLevel}`);
  }
}
