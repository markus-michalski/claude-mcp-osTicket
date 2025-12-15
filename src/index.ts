#!/usr/bin/env node

/**
 * osTicket MCP Server
 *
 * Provides 11 tools for ticket management via osTicket REST API.
 * Follows MCP best practices with Zod schemas, proper annotations,
 * and actionable error messages.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { homedir } from 'os';
import { join } from 'path';

// Configuration
import { Configuration } from './config/Configuration.js';

// Infrastructure
import { Logger } from './infrastructure/logging/Logger.js';
import { OsTicketApiClient } from './infrastructure/http/OsTicketApiClient.js';

// Schemas
import {
  GetTicketInputSchema,
  ListTicketsInputSchema,
  SearchTicketsInputSchema,
  GetStatsInputSchema,
  CreateTicketInputSchema,
  UpdateTicketInputSchema,
  DeleteTicketInputSchema,
  GetParentTicketInputSchema,
  GetChildTicketsInputSchema,
  CreateSubticketLinkInputSchema,
  UnlinkSubticketInputSchema,
  CHARACTER_LIMIT,
  type GetTicketInput,
  type ListTicketsInput,
  type SearchTicketsInput,
  type CreateTicketInput,
  type UpdateTicketInput,
  type DeleteTicketInput,
  type GetParentTicketInput,
  type GetChildTicketsInput,
  type CreateSubticketLinkInput,
  type UnlinkSubticketInput
} from './schemas/index.js';

// Constants
import { SERVER_NAME, SERVER_VERSION } from './constants.js';

// ============================================================================
// Server Setup
// ============================================================================

const config = new Configuration();

// Initialize logger
const logFilePath = join(homedir(), '.claude', 'mcp-servers', 'osticket', 'logs', 'server.log');
const logger = new Logger(
  (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  logFilePath
);

// Initialize API client
if (!config.osTicketApiKey || !config.osTicketApiUrl) {
  logger.error('OSTICKET_API_URL and OSTICKET_API_KEY are required in .env');
  process.exit(1);
}

const apiClient = new OsTicketApiClient(
  config.osTicketApiUrl,
  config.osTicketApiKey,
  config.osTicketApiRejectUnauthorized
);

// Create MCP server instance
const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format error message with actionable suggestions
 */
function formatError(error: unknown, context: string): string {
  const message = error instanceof Error ? error.message : String(error);

  // Provide actionable suggestions based on error type
  if (message.includes('404') || message.includes('not found')) {
    return `Error: ${context} - Resource not found. Verify the ticket number is correct and exists in osTicket.`;
  }
  if (message.includes('401') || message.includes('Unauthorized')) {
    return `Error: ${context} - Authentication failed. Check OSTICKET_API_KEY is valid and active.`;
  }
  if (message.includes('403') || message.includes('Forbidden')) {
    return `Error: ${context} - Permission denied. Ensure the API key has required permissions in osTicket Admin Panel.`;
  }
  if (message.includes('501') || message.includes('Not Implemented')) {
    return `Error: ${context} - Feature not available. The Subticket Manager plugin may not be installed.`;
  }
  if (message.includes('timeout')) {
    return `Error: ${context} - Request timed out. Try again or check osTicket server status.`;
  }

  return `Error: ${context} - ${message}`;
}

/**
 * Truncate response if it exceeds character limit
 */
function truncateIfNeeded(data: unknown[], total: number): { items: unknown[]; truncated: boolean; truncationMessage?: string } {
  const json = JSON.stringify(data, null, 2);

  if (json.length > CHARACTER_LIMIT) {
    // Reduce items until under limit
    let truncatedData = [...data];
    while (JSON.stringify(truncatedData, null, 2).length > CHARACTER_LIMIT && truncatedData.length > 1) {
      truncatedData = truncatedData.slice(0, Math.ceil(truncatedData.length / 2));
    }

    return {
      items: truncatedData,
      truncated: true,
      truncationMessage: `Response truncated from ${data.length} to ${truncatedData.length} items (${total} total). Use 'offset' parameter to see more results.`
    };
  }

  return { items: data, truncated: false };
}

// ============================================================================
// Tool Registrations
// ============================================================================

// ---------------------------------------------------------------------------
// osticket_get_ticket - Get a specific ticket with all messages
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_get_ticket',
  {
    title: 'Get osTicket Ticket',
    description: `Get a specific osTicket ticket by ID or number with all messages and metadata.

This tool retrieves complete ticket details including:
- Ticket info (number, subject, status, department, priority, created/updated dates)
- User info (name, email)
- All thread messages (original message and replies)
- Assignee information

Args:
  - id (number, optional): Internal ticket database ID
  - number (string, optional): Public ticket number (e.g., "680284")
  One of id or number is required.

Returns:
  Complete ticket object with all messages and metadata.

Examples:
  - Get by number: { "number": "680284" }
  - Get by ID: { "id": 42 }

Error Handling:
  - Returns "Resource not found" if ticket doesn't exist
  - Returns "Permission denied" if API key lacks read access`,
    inputSchema: GetTicketInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: GetTicketInput) => {
    try {
      const ticketNumber = params.number || String(params.id);
      const ticket = await apiClient.getTicket(ticketNumber);

      return {
        content: [{ type: 'text', text: JSON.stringify({ ticket }, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to get ticket') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_list_tickets - List tickets with optional filters
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_list_tickets',
  {
    title: 'List osTicket Tickets',
    description: `List osTicket tickets with optional filters and pagination.

Retrieves a paginated list of tickets, optionally filtered by status or department.
Returns ticket summaries (not full messages) for efficient browsing.

Args:
  - status (string, optional): Filter by status (open, closed, resolved, archived)
  - departmentId (number, optional): Filter by department ID
  - limit (number): Max results (default: 20, max: 100)
  - offset (number): Skip N results for pagination (default: 0)

Returns:
  {
    "tickets": [...],
    "count": number,
    "total": number,
    "offset": number,
    "has_more": boolean,
    "next_offset": number | undefined
  }

Examples:
  - List open tickets: { "status": "open", "limit": 10 }
  - Paginate: { "offset": 20, "limit": 20 }
  - Filter by department: { "departmentId": 5 }`,
    inputSchema: ListTicketsInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: ListTicketsInput) => {
    try {
      const result = await apiClient.searchTickets({
        status: params.status,
        departmentId: params.departmentId,
        limit: params.limit,
        offset: params.offset
      });

      const tickets = Array.isArray(result) ? result : [];
      const total = tickets.length + (params.offset || 0);

      // Check truncation
      const { items, truncated, truncationMessage } = truncateIfNeeded(tickets, total);

      const response = {
        tickets: items,
        count: items.length,
        total,
        offset: params.offset || 0,
        has_more: tickets.length === params.limit,
        ...(tickets.length === params.limit ? { next_offset: (params.offset || 0) + tickets.length } : {}),
        ...(truncated ? { truncated: true, truncation_message: truncationMessage } : {})
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to list tickets') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_search_tickets - Search tickets by subject or number
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_search_tickets',
  {
    title: 'Search osTicket Tickets',
    description: `Search tickets by subject, number, or content.

Performs full-text search across ticket subjects and numbers.
Returns matching tickets with relevance ranking.

Args:
  - query (string): Search string (min 2, max 200 characters)
  - limit (number): Max results (default: 20, max: 100)

Returns:
  {
    "tickets": [...],
    "count": number,
    "total": number,
    "query": string,
    "has_more": boolean
  }

Examples:
  - Search: { "query": "login problem" }
  - Search with limit: { "query": "bug", "limit": 50 }

Tips:
  - Use specific keywords for better results
  - Try ticket numbers for exact matches`,
    inputSchema: SearchTicketsInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: SearchTicketsInput) => {
    try {
      const result = await apiClient.searchTickets({
        query: params.query,
        limit: params.limit
      });

      const tickets = Array.isArray(result) ? result : [];

      // Check truncation
      const { items, truncated, truncationMessage } = truncateIfNeeded(tickets, tickets.length);

      const response = {
        tickets: items,
        count: items.length,
        total: tickets.length,
        query: params.query,
        has_more: tickets.length === params.limit,
        ...(truncated ? { truncated: true, truncation_message: truncationMessage } : {})
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to search tickets') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_get_stats - Get ticket statistics
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_get_stats',
  {
    title: 'Get osTicket Statistics',
    description: `Get aggregated ticket statistics from osTicket.

Returns summary statistics about all tickets:
- Total ticket count
- Open/closed/resolved counts
- Overdue count
- Per-status breakdown

Args: None

Returns:
  Statistics object with counts and breakdowns.

Use cases:
  - Dashboard overview
  - Monitoring ticket volume
  - Identifying overdue tickets`,
    inputSchema: GetStatsInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async () => {
    try {
      const stats = await apiClient.getTicketStats();

      return {
        content: [{ type: 'text', text: JSON.stringify({ statistics: stats }, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to get statistics') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_create_ticket - Create a new ticket
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_create_ticket',
  {
    title: 'Create osTicket Ticket',
    description: `Create a new ticket in osTicket with Markdown support.

IMPORTANT - Project Context Requirement:
Every ticket MUST include project context. If the user doesn't specify a project,
ask them: "Geht es um das aktuelle Projekt [PROJECT_NAME] oder ein anderes Projekt?"

Args:
  - subject (string, required): Ticket subject/title
  - message (string, required): Ticket description (supports Markdown)
  - projectContext (string, optional): Project name - will be prepended as "**Projekt:** [value]"
  - name (string, optional): User name (uses env default if not provided)
  - email (string, optional): User email (uses env default if not provided)
  - format ('markdown'|'html'|'text'): Message format (default: markdown)
  - topicId (number, optional): Help Topic ID (uses env default if not provided)

Returns:
  {
    "success": true,
    "ticketNumber": "680284",
    "message": "Ticket created successfully..."
  }

Examples:
  - Basic: { "subject": "Login issue", "message": "Cannot login to portal" }
  - With project: { "subject": "Bug", "message": "Error...", "projectContext": "invoice-management" }`,
    inputSchema: CreateTicketInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  async (params: CreateTicketInput) => {
    try {
      // Use defaults from config
      const name = params.name || config.osTicketDefaultName;
      const email = params.email || config.osTicketDefaultEmail;
      const topicId = params.topicId || config.osTicketDefaultTopicId || undefined;

      // Validate required fields
      if (!name) {
        return {
          content: [{ type: 'text', text: 'Error: Name is required. Provide name parameter or set OSTICKET_DEFAULT_NAME in .env' }],
          isError: true
        };
      }
      if (!email) {
        return {
          content: [{ type: 'text', text: 'Error: Email is required. Provide email parameter or set OSTICKET_DEFAULT_EMAIL in .env' }],
          isError: true
        };
      }

      // Build message with project context
      let finalMessage = params.message;
      if (params.projectContext) {
        finalMessage = `**Projekt:** ${params.projectContext}\n\n${finalMessage}`;
      }

      const ticketNumber = await apiClient.createTicket({
        name,
        email,
        subject: params.subject,
        message: finalMessage,
        format: params.format,
        topicId,
        alert: false,
        autorespond: false
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ticketNumber,
            projectContext: params.projectContext || null,
            message: `Ticket created successfully with number: ${ticketNumber}${topicId ? ` (topic ID ${topicId})` : ''}${params.projectContext ? ` for project "${params.projectContext}"` : ''}`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to create ticket') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_update_ticket - Update an existing ticket
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_update_ticket',
  {
    title: 'Update osTicket Ticket',
    description: `Update an existing ticket's properties (department, status, assignee, etc.).

Can update one or more properties in a single call. Supports adding internal notes
that are visible to staff only.

Args:
  - number (string, required): Ticket number to update
  - departmentId (string|number, optional): Department ID or name
  - statusId (string|number, optional): Status ID or name (e.g., "Open", "Closed")
  - topicId (string|number, optional): Help Topic ID or name
  - staffId (string|number, optional): Staff ID or username to assign
  - slaId (string|number, optional): SLA Plan ID or name
  - parentTicketNumber (string, optional): Make this a subticket of another ticket
  - note (string, optional): Add internal note (staff only)
  - noteTitle (string, optional): Title for note (default: "API Update")
  - noteFormat ('markdown'|'html'|'text'): Note format (default: markdown)

Returns:
  {
    "success": true,
    "ticket": {...updated ticket...},
    "message": "Ticket updated successfully"
  }

Examples:
  - Close ticket: { "number": "680284", "statusId": "Closed" }
  - Add note: { "number": "680284", "note": "Investigated, working on fix" }
  - Assign: { "number": "680284", "staffId": 5 }`,
    inputSchema: UpdateTicketInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: UpdateTicketInput) => {
    try {
      const updates: Record<string, unknown> = {};

      if (params.departmentId !== undefined) updates.departmentId = params.departmentId;
      if (params.statusId !== undefined) updates.statusId = params.statusId;
      if (params.topicId !== undefined) updates.topicId = params.topicId;
      if (params.staffId !== undefined) updates.staffId = params.staffId;
      if (params.slaId !== undefined) updates.slaId = params.slaId;
      if (params.parentTicketNumber !== undefined) updates.parentTicketNumber = params.parentTicketNumber;
      if (params.note !== undefined) updates.note = params.note;
      if (params.noteTitle !== undefined) updates.noteTitle = params.noteTitle;
      if (params.noteFormat !== undefined) updates.noteFormat = params.noteFormat;

      const result = await apiClient.updateTicket(params.number, updates);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ticket: result,
            message: `Ticket ${params.number} updated successfully`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to update ticket') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_delete_ticket - Delete a ticket permanently
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_delete_ticket',
  {
    title: 'Delete osTicket Ticket',
    description: `Permanently delete a ticket from osTicket.

WARNING: This action is IRREVERSIBLE! The ticket and all its messages
will be permanently removed from the database.

Args:
  - number (string, required): Ticket number to delete

Returns:
  {
    "success": true,
    "message": "Ticket deleted successfully"
  }

Use with caution:
  - Consider closing instead of deleting to preserve history
  - Verify ticket number before deletion`,
    inputSchema: DeleteTicketInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  async (params: DeleteTicketInput) => {
    try {
      await apiClient.deleteTicket(params.number);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Ticket ${params.number} deleted successfully`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to delete ticket') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_get_parent_ticket - Get parent of a subticket
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_get_parent_ticket',
  {
    title: 'Get Parent Ticket',
    description: `Get the parent ticket of a subticket.

Requires the Subticket Manager Plugin to be installed in osTicket.
Returns the parent ticket info if this ticket is a subticket,
or null if it has no parent.

Args:
  - number (string, required): Child ticket number

Returns:
  {
    "success": true,
    "parent": { ticket_id, number, subject, status } | null,
    "message": "..."
  }

Error Handling:
  - Returns HTTP 501 if Subticket Manager plugin is not installed`,
    inputSchema: GetParentTicketInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: GetParentTicketInput) => {
    try {
      const result = await apiClient.getParentTicket(params.number);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            parent: result.parent ?? null,
            message: result.parent
              ? `Parent ticket found: ${result.parent.number}`
              : `Ticket ${params.number} has no parent`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to get parent ticket') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_get_child_tickets - Get subtickets of a parent
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_get_child_tickets',
  {
    title: 'Get Child Tickets',
    description: `Get all child tickets (subtickets) of a parent ticket.

Requires the Subticket Manager Plugin to be installed in osTicket.
Returns a list of all subtickets linked to the specified parent.

Args:
  - number (string, required): Parent ticket number

Returns:
  {
    "success": true,
    "children": [{ ticket_id, number, subject, status }, ...],
    "total": number,
    "message": "Found N child ticket(s)"
  }

Error Handling:
  - Returns HTTP 501 if Subticket Manager plugin is not installed`,
    inputSchema: GetChildTicketsInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: GetChildTicketsInput) => {
    try {
      const result = await apiClient.getChildTickets(params.number);
      const children = result.children || [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            children,
            total: children.length,
            message: `Found ${children.length} child ticket(s) for ticket ${params.number}`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to get child tickets') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_create_subticket_link - Create parent-child relationship
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_create_subticket_link',
  {
    title: 'Create Subticket Link',
    description: `Create a parent-child relationship between two tickets.

Requires the Subticket Manager Plugin. The child ticket will become
a subticket of the parent. A ticket can only have one parent.

Args:
  - parentNumber (string, required): Parent ticket number
  - childNumber (string, required): Child ticket number

Returns:
  {
    "success": true,
    "parent": { ticket_id, number, subject, status },
    "child": { ticket_id, number, subject, status },
    "message": "Subticket link created"
  }

Constraints:
  - Child ticket must not already have a parent
  - Cannot link a ticket to itself
  - Both tickets must exist`,
    inputSchema: CreateSubticketLinkInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  async (params: CreateSubticketLinkInput) => {
    try {
      const result = await apiClient.createSubticketLink(params.parentNumber, params.childNumber);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            parent: result.parent,
            child: result.child,
            message: `Subticket link created: ${params.childNumber} is now a child of ${params.parentNumber}`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to create subticket link') }],
        isError: true
      };
    }
  }
);

// ---------------------------------------------------------------------------
// osticket_unlink_subticket - Remove parent-child relationship
// ---------------------------------------------------------------------------
server.registerTool(
  'osticket_unlink_subticket',
  {
    title: 'Unlink Subticket',
    description: `Remove the parent-child relationship from a subticket.

Requires the Subticket Manager Plugin. The ticket will become
a standalone ticket again, no longer linked to any parent.

Args:
  - number (string, required): Child ticket number to unlink

Returns:
  {
    "success": true,
    "child": { ticket_id, number, subject, status },
    "message": "Subticket unlinked"
  }

Error Handling:
  - Returns error if ticket has no parent
  - Returns HTTP 501 if plugin not installed`,
    inputSchema: UnlinkSubticketInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: UnlinkSubticketInput) => {
    try {
      const result = await apiClient.unlinkSubticket(params.number);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            child: result.child,
            message: `Subticket ${params.number} has been unlinked from its parent`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: formatError(error, 'Failed to unlink subticket') }],
        isError: true
      };
    }
  }
);

// ============================================================================
// Server Startup
// ============================================================================

async function main(): Promise<void> {
  logger.info(`Starting ${SERVER_NAME} v${SERVER_VERSION}...`);
  config.logSummary();

  // Health check
  const healthy = await apiClient.healthCheck();
  if (!healthy) {
    logger.warn('⚠ Health check failed - Some API endpoints may not be available');
  } else {
    logger.info('✓ Health check passed');
  }

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('✓ Server running and ready');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down...');
  process.exit(0);
});

// Start server
main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
