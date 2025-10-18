import { Client, ConnectConfig } from 'ssh2';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import net from 'net';

/**
 * Single SSH Tunnel Connection
 * Manages lifecycle of one SSH connection
 */
export class SSHTunnelConnection extends EventEmitter {
  private client: Client | null = null;
  private isActive = false;
  private lastUsed = Date.now();
  private readonly config: ConnectConfig;
  private localForwardingServer: net.Server | null = null;
  private localPort: number = 0;

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
   * Setup persistent local port forwarding
   * Creates a local server that forwards all connections through SSH tunnel
   */
  async setupLocalForwarding(
    localPort: number,
    remoteHost: string,
    remotePort: number
  ): Promise<number> {
    if (!this.client) {
      throw new Error('SSH client not connected');
    }

    return new Promise((resolve, reject) => {
      // Create local TCP server
      this.localForwardingServer = net.createServer((localSocket) => {
        // Forward each connection through SSH tunnel
        this.client!.forwardOut(
          '127.0.0.1',
          localSocket.localPort || 0,
          remoteHost,
          remotePort,
          (err, stream) => {
            if (err) {
              localSocket.end();
              this.emit('forwardingError', err);
              return;
            }

            // Pipe local socket <-> SSH stream <-> remote socket
            localSocket.pipe(stream).pipe(localSocket);

            localSocket.on('error', (error: Error) => {
              this.emit('socketError', error);
              stream.end();
            });

            stream.on('error', (error: Error) => {
              this.emit('streamError', error);
              localSocket.end();
            });
          }
        );
      });

      // Start listening on local port
      this.localForwardingServer.listen(localPort, '127.0.0.1', () => {
        const addr = this.localForwardingServer!.address() as net.AddressInfo;
        this.localPort = addr.port;
        this.emit('forwardingReady', {
          localPort: this.localPort,
          remoteHost,
          remotePort
        });
        resolve(this.localPort);
      });

      this.localForwardingServer.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get the local forwarding port
   */
  getLocalPort(): number {
    return this.localPort;
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
    // Close local forwarding server first
    if (this.localForwardingServer) {
      await new Promise<void>((resolve) => {
        this.localForwardingServer!.close(() => resolve());
      });
      this.localForwardingServer = null;
      this.localPort = 0;
    }

    // Close SSH client
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
