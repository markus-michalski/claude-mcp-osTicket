#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { homedir } from 'os';
import { join } from 'path';

// Configuration
import { Configuration } from './config/Configuration.js';

// Infrastructure
import { SSHTunnelPool } from './infrastructure/ssh/SSHTunnelPool.js';
import { DatabaseConnectionManager } from './infrastructure/database/DatabaseConnectionManager.js';
import { InMemoryCacheProvider } from './infrastructure/cache/InMemoryCacheProvider.js';
import { MySQLTicketRepository } from './infrastructure/database/MySQLTicketRepository.js';
import { Logger } from './infrastructure/logging/Logger.js';
import { OsTicketApiClient } from './infrastructure/http/OsTicketApiClient.js';

// Core
import { TicketService } from './core/services/TicketService.js';
// MetadataService temporarily removed - will be re-added for update API
// import { MetadataService } from './core/services/MetadataService.js';

// Application
import { ToolHandlers } from './application/handlers/ToolHandlers.js';

/**
 * osTicket MCP Server
 * Main entry point
 */
class OsTicketMCPServer {
  private config: Configuration;
  private logger: Logger;
  private tunnelPool: SSHTunnelPool | null = null;
  private dbManager: DatabaseConnectionManager | null = null;
  private cacheProvider: InMemoryCacheProvider | null = null;
  private ticketService: TicketService | null = null;
  // metadataService removed temporarily - will be re-added for update API
  private apiClient: OsTicketApiClient | null = null;
  private handlers: ToolHandlers | null = null;
  private server: Server;
  private isShuttingDown: boolean = false;

  constructor() {
    this.config = new Configuration();

    // Initialize logger
    const logFilePath = join(homedir(), '.claude', 'mcp-servers', 'osticket', 'logs', 'server.log');
    this.logger = new Logger(
      (process.env.LOG_LEVEL as any) || 'info',
      logFilePath
    );

    this.server = new Server(
      {
        name: 'osticket-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupSignalHandlers();
  }

  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    this.logger.info('Starting osTicket MCP Server...');
    this.config.logSummary();

    // Initialize infrastructure
    this.tunnelPool = new SSHTunnelPool(
      {
        host: this.config.sshHost,
        port: this.config.sshPort,
        username: this.config.sshUser,
        privateKeyPath: this.config.sshKeyPath,
      },
      {
        maxConnections: this.config.sshPoolSize,
        idleTimeout: this.config.sshIdleTimeout,
        healthCheckInterval: 60000, // 1 minute
      }
    );

    this.dbManager = new DatabaseConnectionManager(
      this.tunnelPool,
      {
        host: this.config.dbHost,
        port: this.config.dbPort,
        database: this.config.dbName,
        user: this.config.dbUser,
        password: this.config.dbPass,
        connectionLimit: this.config.dbConnectionLimit,
        queueLimit: this.config.dbQueueLimit,
      }
    );

    this.cacheProvider = new InMemoryCacheProvider(
      this.config.cacheMaxSize,
      this.config.cacheTTL
    );

    // Initialize core services
    const repository = new MySQLTicketRepository(
      this.dbManager,
      this.config.osTicketTablePrefix
    );

    this.ticketService = new TicketService(repository, this.cacheProvider);

    // Metadata service temporarily removed - will be re-added for update API
    // this.metadataService = new MetadataService(repository);

    // Initialize API client (optional - only if API key is configured)
    if (this.config.osTicketApiKey) {
      this.apiClient = new OsTicketApiClient(
        this.config.osTicketApiUrl,
        this.config.osTicketApiKey,
        this.config.osTicketApiRejectUnauthorized
      );
      this.logger.info('✓ API client initialized');
    } else {
      this.logger.warn('⚠ API client not initialized (OSTICKET_API_KEY not set)');
    }

    // Initialize handlers (metadataService removed - will be re-added for update API)
    this.handlers = new ToolHandlers(this.ticketService, this.apiClient || undefined, this.config);

    // Connect to database
    this.logger.info('Connecting to database...');
    await this.dbManager.connect();
    this.logger.info('✓ Database connected');

    // Health check
    const healthy = await this.ticketService.healthCheck();
    if (!healthy) {
      throw new Error('Health check failed - database not accessible');
    }
    this.logger.info('✓ Health check passed');
  }

  /**
   * Setup MCP tool handlers
   */
  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_ticket',
            description: 'Get a specific osTicket ticket by ID or number with all messages',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'Ticket ID',
                },
                number: {
                  type: 'string',
                  description: 'Ticket number (alternative to ID)',
                },
              },
            },
          },
          {
            name: 'list_tickets',
            description: 'List osTicket tickets with optional filters',
            inputSchema: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  description: 'Filter by status (open, closed, resolved, archived)',
                },
                departmentId: {
                  type: 'number',
                  description: 'Filter by department ID',
                },
                limit: {
                  type: 'number',
                  description: 'Limit results (default: 20)',
                },
                offset: {
                  type: 'number',
                  description: 'Offset for pagination (default: 0)',
                },
              },
            },
          },
          {
            name: 'search_tickets',
            description: 'Search tickets by subject or number',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query',
                },
                limit: {
                  type: 'number',
                  description: 'Limit results (default: 20)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_ticket_stats',
            description: 'Get osTicket statistics (total, open, closed, overdue, etc.)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'create_ticket',
            description: 'Create a new osTicket ticket via API. If name/email/topicId are not provided, defaults from environment variables are used. Supports Markdown formatting.',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'User name (optional - uses OSTICKET_DEFAULT_NAME if not provided)',
                },
                email: {
                  type: 'string',
                  description: 'User email address (optional - uses OSTICKET_DEFAULT_EMAIL if not provided)',
                },
                subject: {
                  type: 'string',
                  description: 'Ticket subject',
                },
                message: {
                  type: 'string',
                  description: 'Ticket message/description (supports Markdown)',
                },
                format: {
                  type: 'string',
                  description: 'Message format (optional): "markdown" (default), "html", or "text".',
                  enum: ['markdown', 'html', 'text'],
                },
                topicId: {
                  type: 'number',
                  description: 'Help Topic ID (optional - uses OSTICKET_DEFAULT_TOPIC_ID if not provided)',
                },
              },
              required: ['subject', 'message'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.handlers) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Server not initialized' }, null, 2),
            },
          ],
          isError: true,
        };
      }

      try {
        let result: any;

        switch (name) {
          case 'get_ticket':
            result = await this.handlers.handleGetTicket(args as any);
            break;

          case 'list_tickets':
            result = await this.handlers.handleListTickets(args as any);
            break;

          case 'search_tickets':
            result = await this.handlers.handleSearchTickets(args as any);
            break;

          case 'get_ticket_stats':
            result = await this.handlers.handleGetStats();
            break;

          case 'create_ticket':
            result = await this.handlers.handleCreateTicket(args as any);
            break;

          default:
            result = { error: `Unknown tool: ${name}` };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !!result.error,
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('uncaughtException', (error: any) => {
      // Don't log EPIPE errors (broken pipe when client disconnects)
      // Logging would trigger another EPIPE → infinite loop
      if (error.code !== 'EPIPE') {
        this.logger.error('Uncaught exception:', error);
      }
      this.shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled rejection:', reason);
      this.shutdown('unhandledRejection');
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    await this.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Listen for close event from MCP client (e.g., when user exits Claude Code)
    this.server.onclose = async () => {
      await this.shutdown('close');
    };

    this.logger.info('✓ Server running and ready');
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(signal: string): Promise<void> {
    // Prevent multiple shutdown calls
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    this.logger.warn(`Received ${signal}, shutting down gracefully...`);

    try {
      if (this.cacheProvider) {
        this.cacheProvider.shutdown();
      }

      if (this.dbManager) {
        await this.dbManager.disconnect();
      }

      if (this.tunnelPool) {
        await this.tunnelPool.shutdown();
      }

      this.logger.info('✓ Shutdown complete');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Start server
const server = new OsTicketMCPServer();
server.start().catch((error) => {
  process.stderr.write(`[MCP] Failed to start server: ${error}\n`);
  process.exit(1);
});
