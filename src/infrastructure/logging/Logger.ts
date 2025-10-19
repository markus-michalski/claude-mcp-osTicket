import { writeFileSync, appendFileSync, existsSync, mkdirSync, statSync, renameSync, unlinkSync, readdirSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Logger for MCP Server
 * Writes to stderr (visible in MCP debug) and optional log file
 */
export class Logger {
  private logFilePath: string | null = null;
  private logLevel: LogLevel;
  private isDebugMode: boolean;
  private maxLogSizeBytes: number = 10 * 1024 * 1024; // 10MB default
  private maxRotatedLogs: number = 5; // Keep last 5 rotated logs

  constructor(logLevel: LogLevel = 'info', logFilePath?: string) {
    this.logLevel = logLevel;
    this.isDebugMode = process.env.MCP_DEBUG === 'true';

    if (logFilePath) {
      this.initializeLogFile(logFilePath);
    }
  }

  /**
   * Initialize log file with rotation
   */
  private initializeLogFile(logFilePath: string): void {
    try {
      const logDir = dirname(logFilePath);

      // Create log directory if it doesn't exist
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }

      this.logFilePath = logFilePath;

      // Rotate log if it's too large
      this.rotateLogIfNeeded();

      // Clean up old rotated logs
      this.cleanupOldRotatedLogs();

      // Write initial log header
      const header = `\n${'='.repeat(80)}\nMCP Server Log - ${new Date().toISOString()}\n${'='.repeat(80)}\n`;
      writeFileSync(this.logFilePath, header, { flag: 'a' });

      this.info(`Logging initialized: ${this.logFilePath}`);
    } catch (error) {
      this.error(`Failed to initialize log file: ${error}`);
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private rotateLogIfNeeded(): void {
    if (!this.logFilePath || !existsSync(this.logFilePath)) {
      return;
    }

    try {
      const stats = statSync(this.logFilePath);

      // If log file is larger than max size, rotate it
      if (stats.size > this.maxLogSizeBytes) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = `${this.logFilePath}.${timestamp}`;

        // Rename current log to rotated version
        renameSync(this.logFilePath, rotatedPath);
      }
    } catch (error) {
      // Silently ignore rotation errors
    }
  }

  /**
   * Clean up old rotated log files
   * Keeps only the most recent N rotated logs
   */
  private cleanupOldRotatedLogs(): void {
    if (!this.logFilePath) {
      return;
    }

    try {
      const logDir = dirname(this.logFilePath);
      const logFileName = this.logFilePath.split('/').pop();

      if (!logFileName) return;

      // Find all rotated log files
      const files = readdirSync(logDir);
      const rotatedLogs = files
        .filter(f => f.startsWith(logFileName + '.'))
        .map(f => ({
          name: f,
          path: join(logDir, f),
          mtime: statSync(join(logDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime); // Sort by modification time, newest first

      // Delete old rotated logs (keep only last N)
      if (rotatedLogs.length > this.maxRotatedLogs) {
        const logsToDelete = rotatedLogs.slice(this.maxRotatedLogs);
        logsToDelete.forEach(log => {
          try {
            unlinkSync(log.path);
          } catch (error) {
            // Silently ignore deletion errors
          }
        });
      }
    } catch (error) {
      // Silently ignore cleanup errors
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
    // Catch EPIPE errors (broken pipe when Claude Code closes connection)
    try {
      process.stderr.write(formattedMessage + '\n');
    } catch (error: any) {
      // Ignore EPIPE errors to prevent infinite exception loops
      if (error.code !== 'EPIPE') {
        // Only re-throw non-EPIPE errors
        throw error;
      }
      // EPIPE means the client disconnected - silently ignore
    }

    // Write to log file if configured
    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, formattedMessage + '\n');
      } catch (error: any) {
        // Don't log file errors to avoid infinite loops on EPIPE
        // Silently fail if we can't write to file
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
