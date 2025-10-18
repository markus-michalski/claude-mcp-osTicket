import mysql from 'mysql2/promise';
import { SSHTunnelPool } from '../ssh/SSHTunnelPool.js';
import { CircuitBreaker } from './CircuitBreaker.js';

/**
 * Database Connection Manager with SSH Tunnel support
 * Manages MySQL connection pool over SSH tunnel
 */
export class DatabaseConnectionManager {
  private pool: mysql.Pool | null = null;
  private circuitBreaker = new CircuitBreaker();
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
    // Ensure SSH tunnel is established first
    await this.tunnelPool.getConnection();

    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
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
      console.error('[DB] Health check failed:', error);
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
      console.warn(`[DB] Slow query detected (${duration}ms):`, sql.substring(0, 100));
    }
  }

  private handleQueryError(error: any, sql: string): void {
    console.error('[DB] Query error:', {
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
