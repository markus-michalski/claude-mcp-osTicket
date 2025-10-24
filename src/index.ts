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
import { Logger } from './infrastructure/logging/Logger.js';
import { OsTicketApiClient } from './infrastructure/http/OsTicketApiClient.js';

// Application
import { ToolHandlers } from './application/handlers/ToolHandlers.js';

/**
 * osTicket MCP Server
 * Main entry point
 *
 * Uses osTicket REST API exclusively (no database access)
 */
class OsTicketMCPServer {
  private config: Configuration;
  private logger: Logger;
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
        version: '2.0.0', // Bumped to 2.0.0 - API-only, no DB access
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
    this.logger.info('Starting osTicket MCP Server (API-only mode)...');
    this.config.logSummary();

    // Initialize API client (required)
    if (!this.config.osTicketApiKey || !this.config.osTicketApiUrl) {
      throw new Error('OSTICKET_API_URL and OSTICKET_API_KEY are required in .env');
    }

    this.apiClient = new OsTicketApiClient(
      this.config.osTicketApiUrl,
      this.config.osTicketApiKey,
      this.config.osTicketApiRejectUnauthorized
    );
    this.logger.info('✓ API client initialized');

    // Initialize handlers
    this.handlers = new ToolHandlers(this.apiClient, this.config);

    // Health check
    const healthy = await this.apiClient.healthCheck();
    if (!healthy) {
      throw new Error('Health check failed - API not accessible');
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
          {
            name: 'update_ticket',
            description: 'Update an existing osTicket ticket (department, status, priority, assignee, etc.)',
            inputSchema: {
              type: 'object',
              properties: {
                number: {
                  type: 'string',
                  description: 'Ticket number',
                },
                departmentId: {
                  type: ['string', 'number'],
                  description: 'Department ID or name',
                },
                statusId: {
                  type: ['string', 'number'],
                  description: 'Status ID or name (Open, Closed, etc.)',
                },
                priorityId: {
                  type: ['string', 'number'],
                  description: 'Priority ID or name',
                },
                topicId: {
                  type: ['string', 'number'],
                  description: 'Help Topic ID or name',
                },
                staffId: {
                  type: ['string', 'number'],
                  description: 'Staff ID or username (to assign ticket)',
                },
                slaId: {
                  type: ['string', 'number'],
                  description: 'SLA Plan ID or name',
                },
                parentTicketNumber: {
                  type: 'string',
                  description: 'Parent ticket number (to make this a subticket)',
                },
              },
              required: ['number'],
            },
          },
          {
            name: 'delete_ticket',
            description: 'Delete an osTicket ticket permanently',
            inputSchema: {
              type: 'object',
              properties: {
                number: {
                  type: 'string',
                  description: 'Ticket number',
                },
              },
              required: ['number'],
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

          case 'update_ticket':
            result = await this.handlers.handleUpdateTicket(args as any);
            break;

          case 'delete_ticket':
            result = await this.handlers.handleDeleteTicket(args as any);
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

    // Listen for close event from MCP client
    this.server.onclose = async () => {
      await this.shutdown('close');
    };

    this.logger.info('✓ Server running and ready (API-only mode)');
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
