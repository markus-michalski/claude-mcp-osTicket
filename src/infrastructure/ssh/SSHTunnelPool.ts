import { EventEmitter } from 'events';
import { SSHTunnelConnection } from './SSHTunnelConnection.js';

/**
 * SSH Tunnel Connection Pool
 * Manages multiple persistent SSH connections with auto-reconnect
 */
export class SSHTunnelPool extends EventEmitter {
  private pool: Map<string, SSHTunnelConnection> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly maxConnections: number;
  private readonly idleTimeout: number;

  constructor(
    private readonly config: {
      host: string;
      port?: number;
      username: string;
      privateKeyPath: string;
    },
    options: {
      maxConnections?: number;
      idleTimeout?: number;
      healthCheckInterval?: number;
    } = {}
  ) {
    super();
    this.maxConnections = options.maxConnections || 2;
    this.idleTimeout = options.idleTimeout || 300000; // 5 minutes

    if (options.healthCheckInterval) {
      this.startHealthCheck(options.healthCheckInterval);
    }
  }

  /**
   * Get an available connection from pool
   */
  async getConnection(): Promise<SSHTunnelConnection> {
    // Find idle connection
    const idle = this.findIdleConnection();
    if (idle) {
      idle.markActive();
      return idle;
    }

    // Create new connection if pool not full
    if (this.pool.size < this.maxConnections) {
      return await this.createConnection();
    }

    // Wait for connection to become available
    return await this.waitForConnection();
  }

  /**
   * Release a connection back to pool
   */
  releaseConnection(connection: SSHTunnelConnection): void {
    connection.markIdle();
  }

  /**
   * Shutdown pool and close all connections
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const closePromises = Array.from(this.pool.values()).map(conn => conn.close());
    await Promise.all(closePromises);
    this.pool.clear();

    this.emit('shutdown');
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    let active = 0;
    let idle = 0;

    this.pool.forEach(conn => {
      if (conn.isHealthy()) {
        // Simple active check - could be enhanced
        idle++;
      }
    });

    return {
      total: this.pool.size,
      active,
      idle,
      maxConnections: this.maxConnections
    };
  }

  private findIdleConnection(): SSHTunnelConnection | null {
    for (const conn of this.pool.values()) {
      if (conn.isHealthy()) {
        return conn;
      }
    }
    return null;
  }

  private async createConnection(): Promise<SSHTunnelConnection> {
    const id = this.generateConnectionId();
    const connection = new SSHTunnelConnection(this.config);

    // Setup event handlers
    connection.on('error', (err) => this.handleConnectionError(connection, err));
    connection.on('closed', () => this.handleConnectionClosed(connection));
    connection.on('idle', () => this.scheduleIdleRemoval(connection));

    await connection.connect();
    this.pool.set(id, connection);
    this.emit('connectionCreated', { id, total: this.pool.size });

    return connection;
  }

  private async waitForConnection(): Promise<SSHTunnelConnection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for available connection'));
      }, 30000);

      const checkInterval = setInterval(() => {
        const idle = this.findIdleConnection();
        if (idle) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          idle.markActive();
          resolve(idle);
        }
      }, 100);
    });
  }

  private handleConnectionError(conn: SSHTunnelConnection, error: Error): void {
    this.emit('connectionError', error);

    // Attempt reconnect
    conn.reconnect(3).catch(err => {
      this.emit('connectionFailed', err);
      this.removeConnection(conn);
    });
  }

  private handleConnectionClosed(conn: SSHTunnelConnection): void {
    this.removeConnection(conn);
  }

  private scheduleIdleRemoval(conn: SSHTunnelConnection): void {
    setTimeout(() => {
      if (conn.isIdleFor(this.idleTimeout)) {
        this.removeConnection(conn);
      }
    }, this.idleTimeout);
  }

  private removeConnection(conn: SSHTunnelConnection): void {
    const entries = Array.from(this.pool.entries());
    const entry = entries.find(([, c]) => c === conn);

    if (entry) {
      const [id] = entry;
      this.pool.delete(id);
      conn.close();
      this.emit('connectionRemoved', { id, total: this.pool.size });
    }
  }

  private startHealthCheck(interval: number): void {
    this.healthCheckInterval = setInterval(() => {
      this.pool.forEach((conn, id) => {
        if (!conn.isHealthy()) {
          this.emit('unhealthyConnection', id);
          conn.reconnect(3).catch(() => this.removeConnection(conn));
        }
      });
    }, interval);
  }

  private generateConnectionId(): string {
    return `ssh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export interface PoolStats {
  total: number;
  active: number;
  idle: number;
  maxConnections: number;
}
