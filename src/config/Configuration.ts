import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Application Configuration
 * Loads and validates environment variables
 */
export class Configuration {
  // SSH Settings
  public readonly sshHost: string;
  public readonly sshPort: number;
  public readonly sshUser: string;
  public readonly sshKeyPath: string;
  public readonly sshPoolSize: number;
  public readonly sshIdleTimeout: number;

  // Database Settings
  public readonly dbHost: string;
  public readonly dbPort: number;
  public readonly dbName: string;
  public readonly dbUser: string;
  public readonly dbPass: string;
  public readonly dbConnectionLimit: number;
  public readonly dbQueueLimit: number;

  // osTicket Settings
  public readonly osTicketTablePrefix: string;
  public readonly osTicketApiUrl: string;
  public readonly osTicketApiKey: string;
  public readonly osTicketApiRejectUnauthorized: boolean;
  public readonly osTicketDefaultName: string;
  public readonly osTicketDefaultEmail: string;
  public readonly osTicketDefaultTopicId: number;

  // Cache Settings
  public readonly cacheTTL: number;
  public readonly cacheMaxSize: number;

  // Monitoring
  public readonly logLevel: string;
  public readonly metricsEnabled: boolean;

  constructor() {
    // Load .env file from deployment directory (not CWD!)
    const envPath = join(homedir(), '.claude', 'mcp-servers', 'osticket', '.env');
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath });
    } else {
      // Fallback to CWD for development
      dotenv.config();
    }

    // SSH Configuration
    this.sshHost = this.getRequired('SSH_HOST');
    this.sshPort = parseInt(this.get('SSH_PORT', '22'));
    this.sshUser = this.getRequired('SSH_USER');
    this.sshKeyPath = this.getRequired('SSH_KEY_PATH');
    this.sshPoolSize = parseInt(this.get('SSH_POOL_SIZE', '2'));
    this.sshIdleTimeout = parseInt(this.get('SSH_IDLE_TIMEOUT', '300000'));

    // Database Configuration
    this.dbHost = this.get('DB_HOST', '127.0.0.1');
    this.dbPort = parseInt(this.get('DB_PORT', '3306'));
    this.dbName = this.getRequired('DB_NAME');
    this.dbUser = this.getRequired('DB_USER');
    this.dbPass = this.getRequired('DB_PASS');
    this.dbConnectionLimit = parseInt(this.get('DB_CONNECTION_LIMIT', '10'));
    this.dbQueueLimit = parseInt(this.get('DB_QUEUE_LIMIT', '50'));

    // osTicket Configuration
    this.osTicketTablePrefix = this.get('OSTICKET_TABLE_PREFIX', 'ost_');
    this.osTicketApiUrl = this.get('OSTICKET_API_URL', 'https://127.0.0.1:8000');
    this.osTicketApiKey = this.get('OSTICKET_API_KEY', '');
    this.osTicketApiRejectUnauthorized = this.get('OSTICKET_API_REJECT_UNAUTHORIZED', 'false') === 'true';
    this.osTicketDefaultName = this.get('OSTICKET_DEFAULT_NAME', '');
    this.osTicketDefaultEmail = this.get('OSTICKET_DEFAULT_EMAIL', '');
    this.osTicketDefaultTopicId = parseInt(this.get('OSTICKET_DEFAULT_TOPIC_ID', '0'));

    // Cache Configuration
    this.cacheTTL = parseInt(this.get('CACHE_TTL', '300000'));
    this.cacheMaxSize = parseInt(this.get('CACHE_MAX_SIZE', '1000'));

    // Monitoring
    this.logLevel = this.get('LOG_LEVEL', 'info');
    this.metricsEnabled = this.get('METRICS_ENABLED', 'true') === 'true';

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
    // Validate SSH key path exists
    if (!existsSync(this.sshKeyPath)) {
      throw new Error(`SSH key file not found: ${this.sshKeyPath}`);
    }

    // Validate numeric values
    if (this.dbPort < 1 || this.dbPort > 65535) {
      throw new Error(`Invalid DB_PORT: ${this.dbPort}`);
    }

    if (this.sshPoolSize < 1 || this.sshPoolSize > 10) {
      throw new Error(`SSH_POOL_SIZE must be between 1 and 10, got: ${this.sshPoolSize}`);
    }

    if (this.dbConnectionLimit < 1) {
      throw new Error(`DB_CONNECTION_LIMIT must be at least 1, got: ${this.dbConnectionLimit}`);
    }
  }

  /**
   * Log configuration (without sensitive data)
   */
  public logSummary(): void {
    console.log('[Config] Loaded configuration:');
    console.log(`  SSH: ${this.sshUser}@${this.sshHost}:${this.sshPort}`);
    console.log(`  DB: ${this.dbUser}@${this.dbHost}:${this.dbPort}/${this.dbName}`);
    console.log(`  Table Prefix: ${this.osTicketTablePrefix}`);
    console.log(`  API URL: ${this.osTicketApiUrl}`);
    console.log(`  API Key: ${this.osTicketApiKey ? '***' + this.osTicketApiKey.slice(-4) : 'not set'}`);
    console.log(`  Default User: ${this.osTicketDefaultName ? this.osTicketDefaultName : 'not set'} <${this.osTicketDefaultEmail ? this.osTicketDefaultEmail : 'not set'}>`);
    console.log(`  Default Topic ID: ${this.osTicketDefaultTopicId || 'not set'}`);
    console.log(`  SSH Pool Size: ${this.sshPoolSize}`);
    console.log(`  DB Connection Limit: ${this.dbConnectionLimit}`);
    console.log(`  Cache TTL: ${this.cacheTTL}ms`);
  }
}
