import mysql from 'mysql2/promise';
import { SSHTunnelPool } from '../ssh/SSHTunnelPool.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { Logger } from '../logging/Logger.js';

/**
 * Database Connection Manager with SSH Tunnel support
 * Manages MySQL connection pool over SSH tunnel
 */
export class DatabaseConnectionManager {
  private pool: mysql.Pool | null = null;
  private circuitBreaker = new CircuitBreaker();
  private logger = new Logger().child('DB');
  private metrics = {
    totalQueries: 0,
    slowQueries: 0,
    errors: 0,
    activeConnections: 0
  };

  constructor(
    private readonly tunnelPool: SSHTunnelPool,
    private readonly config: {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      connectionLimit?: number;
      queueLimit?: number;
    }
  ) {}

  /**
   * Initialize connection pool
   */
  async connect(): Promise<void> {
    this.logger.info('Setting up SSH tunnel...');

    // Get SSH connection from pool
    const sshConnection = await this.tunnelPool.getConnection();

    // Setup local port forwarding
    // This creates: localhost:RANDOM_PORT -> SSH-Server -> remote-db:3306
    const localPort = await sshConnection.setupLocalForwarding(
      0, // 0 = OS picks random available port
      this.config.host, // Remote DB host (as seen from SSH server, e.g., 127.0.0.1)
      this.config.port  // Remote DB port (e.g., 3306)
    );

    this.logger.info(`SSH tunnel established: localhost:${localPort} -> ${this.config.host}:${this.config.port}`);

    // Create MySQL pool connecting to LOCAL port (forwarded through tunnel)
    this.pool = mysql.createPool({
      host: '127.0.0.1',  // Connect to LOCAL forwarding port
      port: localPort,     // Use the forwarded port
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      connectionLimit: this.config.connectionLimit || 10,
      queueLimit: this.config.queueLimit || 50,
      waitForConnections: true,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 10000,
      // Prepared statements for security & performance
      namedPlaceholders: false
    });

    this.logger.info('MySQL connection pool created');

    // Test connection
    await this.healthCheck();
  }

  /**
   * Execute a query with circuit breaker protection
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    return this.circuitBreaker.execute(async () => {
      const startTime = Date.now();
      let connection: mysql.PoolConnection | null = null;

      try {
        connection = await this.pool!.getConnection();
        this.metrics.activeConnections++;

        const [rows] = await connection.execute(sql, params);

        const duration = Date.now() - startTime;
        this.trackQueryPerformance(sql, duration);

        return rows as T[];
      } catch (error) {
        this.metrics.errors++;
        this.handleQueryError(error, sql);
        throw error;
      } finally {
        if (connection) {
          connection.release();
          this.metrics.activeConnections--;
        }
      }
    });
  }

  /**
   * Execute a single-row query (returns first row or null)
   */
  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Health check - verify database is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1 as health');
      return true;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get connection pool statistics
   */
  async getStats(): Promise<DatabaseStats> {
    const poolStats = (this.pool as any)?._freeConnections?.length || 0;
    const allConnections = (this.pool as any)?._allConnections?.length || 0;

    return {
      ...this.metrics,
      poolFree: poolStats,
      poolUsed: allConnections,
      circuitState: this.circuitBreaker.getState()
    };
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private trackQueryPerformance(sql: string, duration: number): void {
    this.metrics.totalQueries++;

    if (duration > 1000) {
      this.metrics.slowQueries++;
      this.logger.warn(`Slow query detected (${duration}ms): ${sql.substring(0, 100)}`);
    }
  }

  private handleQueryError(error: any, sql: string): void {
    this.logger.error('Query error:', {
      error: error.message,
      code: error.code,
      sql: sql.substring(0, 100)
    });
  }
}

export interface DatabaseStats {
  totalQueries: number;
  slowQueries: number;
  errors: number;
  activeConnections: number;
  poolFree: number;
  poolUsed: number;
  circuitState: string;
}
