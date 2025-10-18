import { Client, ConnectConfig } from 'ssh2';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';

/**
 * Single SSH Tunnel Connection
 * Manages lifecycle of one SSH connection
 */
export class SSHTunnelConnection extends EventEmitter {
  private client: Client | null = null;
  private isActive = false;
  private lastUsed = Date.now();
  private readonly config: ConnectConfig;

  constructor(config: {
    host: string;
    port?: number;
    username: string;
    privateKeyPath: string;
  }) {
    super();

    this.config = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      privateKey: readFileSync(config.privateKeyPath),
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      readyTimeout: 30000
    };
  }

  /**
   * Establish SSH connection
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = new Client();

      this.client
        .on('ready', () => {
          this.emit('connected');
          resolve();
        })
        .on('error', (err) => {
          this.emit('error', err);
          reject(err);
        })
        .on('close', () => {
          this.emit('closed');
        })
        .on('end', () => {
          this.emit('end');
        })
        .connect(this.config);
    });
  }

  /**
   * Create port forward for database access
   */
  async forwardOut(
    srcAddr: string,
    srcPort: number,
    dstAddr: string,
    dstPort: number
  ): Promise<any> {
    if (!this.client) {
      throw new Error('SSH client not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.forwardOut(
        srcAddr,
        srcPort,
        dstAddr,
        dstPort,
        (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(stream);
        }
      );
    });
  }

  /**
   * Reconnect with exponential backoff
   */
  async reconnect(maxAttempts = 3): Promise<void> {
    let attempt = 1;
    let delay = 1000;

    while (attempt <= maxAttempts) {
      try {
        await this.close();
        await this.delay(delay);
        await this.connect();
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`Failed to reconnect after ${maxAttempts} attempts: ${error}`);
        }
        delay *= 2; // Exponential backoff
        attempt++;
      }
    }
  }

  /**
   * Close SSH connection
   */
  async close(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }

  /**
   * Mark connection as active
   */
  markActive(): void {
    this.isActive = true;
    this.lastUsed = Date.now();
  }

  /**
   * Mark connection as idle
   */
  markIdle(): void {
    this.isActive = false;
    this.lastUsed = Date.now();
    this.emit('idle');
  }

  /**
   * Check if connection is idle for given duration
   */
  isIdleFor(duration: number): boolean {
    return !this.isActive && (Date.now() - this.lastUsed) > duration;
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    return this.client !== null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
