import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Logger for MCP Server
 * Writes to stderr (visible in MCP debug) and optional log file
 */
export class Logger {
  private logFilePath: string | null = null;
  private logLevel: LogLevel;
  private isDebugMode: boolean;

  constructor(logLevel: LogLevel = 'info', logFilePath?: string) {
    this.logLevel = logLevel;
    this.isDebugMode = process.env.MCP_DEBUG === 'true';

    if (logFilePath) {
      this.initializeLogFile(logFilePath);
    }
  }

  /**
   * Initialize log file
   */
  private initializeLogFile(logFilePath: string): void {
    try {
      const logDir = dirname(logFilePath);

      // Create log directory if it doesn't exist
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      this.logFilePath = logFilePath;

      // Write initial log header
      const header = `\n${'='.repeat(80)}\nMCP Server Log - ${new Date().toISOString()}\n${'='.repeat(80)}\n`;
      writeFileSync(this.logFilePath, header, { flag: 'a' });

      this.info(`Logging initialized: ${this.logFilePath}`);
    } catch (error) {
      this.error(`Failed to initialize log file: ${error}`);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, meta?: any): void {
    if (!this.isDebugMode && this.logLevel !== 'debug') return;
    this.log('DEBUG', message, meta);
  }

  /**
   * Log info message
   */
  info(message: string, meta?: any): void {
    if (!this.shouldLog('info')) return;
    this.log('INFO', message, meta);
  }

  /**
   * Log warning message
   */
  warn(message: string, meta?: any): void {
    if (!this.shouldLog('warn')) return;
    this.log('WARN', message, meta);
  }

  /**
   * Log error message
   */
  error(message: string, meta?: any): void {
    if (!this.shouldLog('error')) return;
    this.log('ERROR', message, meta);
  }

  /**
   * Core logging function
   */
  private log(level: string, message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = this.formatMessage(timestamp, level, message, meta);

    // Always write to stderr (visible in debug logs)
    process.stderr.write(formattedMessage + '\n');

    // Write to log file if configured
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, formattedMessage + '\n');
      } catch (error) {
        process.stderr.write(`[Logger] Failed to write to log file: ${error}\n`);
      }
    }
  }

  /**
   * Format log message
   */
  private formatMessage(timestamp: string, level: string, message: string, meta?: any): string {
    let formatted = `[${timestamp}] [${level.padEnd(5)}] ${message}`;

    if (meta !== undefined) {
      if (typeof meta === 'object') {
        formatted += '\n' + JSON.stringify(meta, null, 2);
      } else {
        formatted += ` ${meta}`;
      }
    }

    return formatted;
  }

  /**
   * Check if should log based on level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Create a child logger with prefix
   */
  child(prefix: string): ChildLogger {
    return new ChildLogger(this, prefix);
  }
}

/**
 * Child logger with prefix
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private prefix: string
  ) {}

  debug(message: string, meta?: any): void {
    this.parent.debug(`[${this.prefix}] ${message}`, meta);
  }

  info(message: string, meta?: any): void {
    this.parent.info(`[${this.prefix}] ${message}`, meta);
  }

  warn(message: string, meta?: any): void {
    this.parent.warn(`[${this.prefix}] ${message}`, meta);
  }

  error(message: string, meta?: any): void {
    this.parent.error(`[${this.prefix}] ${message}`, meta);
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
