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
import { Logger, type LogLevel } from './infrastructure/logging/Logger.js';
import { OsTicketApiClient } from './infrastructure/http/OsTicketApiClient.js';
import { OsTicketApiError } from './infrastructure/errors/OsTicketApiError.js';

// Schemas
import {
  GetTicketInputSchemaShape,
  GetTicketInputSchema,
  ListTicketsInputSchema,
  SearchTicketsInputSchema,
  GetStatsInputSchema,
  CreateTicketInputSchema,
  UpdateTicketInputSchemaShape,
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

// Utilities
import { processAttachments } from './utils/attachments.js';

// Constants
import { SERVER_NAME, SERVER_VERSION } from './constants.js';

// ============================================================================
// Server Setup
// ============================================================================

const config = new Configuration();

// Initialize logger (use config.logLevel as single source of truth)
const logFilePath = join(homedir(), '.claude', 'mcp-servers', 'osticket', 'logs', 'server.log');
const logger = new Logger(
  config.logLevel as LogLevel,
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
  config.osTicketApiRejectUnauthorized,
  logger
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
 * Format error message with actionable suggestions based on error type
 */
function formatError(error: unknown, context: string): string {
  // Use structured status code matching for OsTicketApiError
  if (error instanceof OsTicketApiError) {
    const suggestions: Record<number, string> = {
      401: 'Authentication failed. Check OSTICKET_API_KEY is valid and active.',
      403: 'Permission denied. Ensure the API key has required permissions in osTicket Admin Panel.',
      404: 'Resource not found. Verify the ticket number is correct and exists in osTicket.',
      501: 'Feature not available. The Subticket Manager plugin may not be installed.',
    };

    const suggestion = suggestions[error.statusCode];
    if (suggestion) {
      return `Error: ${context} - ${suggestion}`;
    }

    return `Error: ${context} - ${error.message}`;
  }

  // Sanitize non-API errors to prevent leaking internal details (hostnames, IPs, ports)
  if (error instanceof Error) {
    const msg = error.message;

    if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
      return `Error: ${context} - Request timed out. Check osTicket server status.`;
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET')) {
      return `Error: ${context} - Cannot connect to osTicket server.`;
    }
    if (msg.includes('ENOTFOUND')) {
      return `Error: ${context} - osTicket host not reachable. Check OSTICKET_API_URL.`;
    }
    if (msg.includes('EPROTO') || msg.includes('ERR_TLS')) {
      return `Error: ${context} - TLS/SSL connection error. Check certificate configuration.`;
    }
    if (msg.includes('Invalid ticket number')) {
      return `Error: ${context} - ${msg}`;
    }

    // Fallback: do NOT expose raw error messages that may contain internal details
    return `Error: ${context} - Unexpected error occurred. Check server logs for details.`;
  }

  return `Error: ${context} - Unknown error occurred.`;
}

/**
 * Truncate response if it exceeds character limit.
 * Uses size estimation to avoid repeated JSON.stringify calls.
 */
function truncateIfNeeded(data: unknown[], total: number): { items: unknown[]; truncated: boolean; truncationMessage?: string } {
  const json = JSON.stringify(data, null, 2);

  if (json.length <= CHARACTER_LIMIT) {
    return { items: data, truncated: false };
  }

  // Estimate average bytes per item, calculate target count directly
  const avgBytesPerItem = json.length / data.length;
  const targetCount = Math.max(1, Math.floor(CHARACTER_LIMIT / avgBytesPerItem));
  const truncatedData = data.slice(0, targetCount);

  return {
    items: truncatedData,
    truncated: true,
    truncationMessage: `Response truncated from ${data.length} to ${truncatedData.length} items (${total} total). Use 'offset' parameter to see more results.`
  };
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
    inputSchema: GetTicketInputSchemaShape.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: GetTicketInput) => {
    try {
      // Runtime validation with refinement (at least id or number required)
      const validated = GetTicketInputSchema.parse(params);
      const ticketNumber = validated.number || String(validated.id);
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
    inputSchema: ListTicketsInputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: ListTicketsInput) => {
    try {
      // Runtime validation with Zod defaults (limit, offset)
      const validated = ListTicketsInputSchema.parse(params);

      const tickets = await apiClient.searchTickets({
        status: validated.status,
        departmentId: validated.departmentId,
        limit: validated.limit,
        offset: validated.offset
      });

      // Check truncation
      const { items, truncated, truncationMessage } = truncateIfNeeded(tickets, tickets.length);

      const response = {
        tickets: items,
        count: items.length,
        offset: validated.offset,
        has_more: tickets.length === validated.limit,
        ...(tickets.length === validated.limit ? { next_offset: validated.offset + tickets.length } : {}),
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
    inputSchema: SearchTicketsInputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: SearchTicketsInput) => {
    try {
      const tickets = await apiClient.searchTickets({
        query: params.query,
        limit: params.limit
      });

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
    inputSchema: GetStatsInputSchema.shape,
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
  - attachments (array, optional): File paths to attach (max 5, each max 10 MB)

Returns:
  {
    "success": true,
    "ticketNumber": "680284",
    "message": "Ticket created successfully..."
  }

Examples:
  - Basic: { "subject": "Login issue", "message": "Cannot login to portal" }
  - With project: { "subject": "Bug", "message": "Error...", "projectContext": "invoice-management" }
  - With attachment: { "subject": "Audit", "message": "See attached", "attachments": [{"path": "/tmp/report.pdf"}] }`,
    inputSchema: CreateTicketInputSchema.shape,
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

      // Build message with project context (sanitize control chars)
      let finalMessage = params.message;
      if (params.projectContext) {
        const sanitizedContext = params.projectContext.replace(/[\r\n\t]/g, ' ').trim();
        finalMessage = `**Projekt:** ${sanitizedContext}\n\n${finalMessage}`;
      }

      // Process file attachments if provided
      let osTicketAttachments: Array<Record<string, string>> | undefined;
      let attachmentSummary: string | undefined;
      if (params.attachments && params.attachments.length > 0) {
        const result = await processAttachments(params.attachments);
        osTicketAttachments = result.attachments;
        attachmentSummary = result.summary;
      }

      const ticketNumber = await apiClient.createTicket({
        name,
        email,
        subject: params.subject,
        message: finalMessage,
        format: params.format,
        topicId,
        alert: false,
        autorespond: false,
        attachments: osTicketAttachments
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ticketNumber,
            projectContext: params.projectContext || null,
            ...(attachmentSummary ? { attachments: attachmentSummary } : {}),
            message: `Ticket created successfully with number: ${ticketNumber}${topicId ? ` (topic ID ${topicId})` : ''}${params.projectContext ? ` for project "${params.projectContext}"` : ''}${attachmentSummary ? `. ${attachmentSummary}` : ''}`
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
    description: `Update an existing ticket's properties (department, status, assignee, due date, etc.).

Can update one or more properties in a single call. Supports adding internal notes
that are visible to staff only.

Args:
  - number (string, required): Ticket number to update
  - departmentId (string|number, optional): Department ID or name
  - statusId (string|number, optional): Status ID or name (e.g., "Open", "Closed")
  - topicId (string|number, optional): Help Topic ID or name
  - staffId (string|number, optional): Staff ID or username to assign
  - slaId (string|number, optional): SLA Plan ID or name
  - dueDate (string|null, optional): Due date in ISO 8601 format (e.g., "2025-01-31"). Set to null to clear.
  - parentTicketNumber (string, optional): Make this a subticket of another ticket
  - note (string, optional): Add internal note (staff only)
  - noteTitle (string, optional): Title for note (default: "API Update")
  - noteFormat ('markdown'|'html'|'text'): Note format (default: markdown)
  - attachments (array, optional): File paths to attach to the note (max 5, each max 10 MB). Requires a note.

Returns:
  {
    "success": true,
    "ticket": {...updated ticket...},
    "message": "Ticket updated successfully"
  }

Examples:
  - Close ticket: { "number": "680284", "statusId": "Closed" }
  - Set due date: { "number": "680284", "dueDate": "2025-01-31" }
  - Add note: { "number": "680284", "note": "Investigated, working on fix" }
  - Assign: { "number": "680284", "staffId": 5 }
  - Note with file: { "number": "680284", "note": "See audit report", "attachments": [{"path": "/tmp/audit.pdf"}] }`,
    inputSchema: UpdateTicketInputSchemaShape.shape,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: UpdateTicketInput) => {
    try {
      // Runtime validation with refinement (at least one update field required)
      const validated = UpdateTicketInputSchema.parse(params);

      // Attachments require a note to attach to
      if (validated.attachments && validated.attachments.length > 0 && !validated.note) {
        return {
          content: [{ type: 'text', text: 'Error: Attachments require a note. Provide a "note" parameter to attach files to.' }],
          isError: true
        };
      }

      const updates: Record<string, unknown> = {};

      if (validated.departmentId !== undefined) updates.departmentId = validated.departmentId;
      if (validated.statusId !== undefined) updates.statusId = validated.statusId;
      if (validated.topicId !== undefined) updates.topicId = validated.topicId;
      if (validated.staffId !== undefined) updates.staffId = validated.staffId;
      if (validated.slaId !== undefined) updates.slaId = validated.slaId;
      if (validated.dueDate !== undefined) updates.dueDate = validated.dueDate;
      if (validated.parentTicketNumber !== undefined) updates.parentTicketNumber = validated.parentTicketNumber;
      if (validated.note !== undefined) updates.note = validated.note;
      if (validated.noteTitle !== undefined) updates.noteTitle = validated.noteTitle;
      if (validated.noteFormat !== undefined) updates.noteFormat = validated.noteFormat;

      // Process file attachments if provided
      let attachmentSummary: string | undefined;
      if (validated.attachments && validated.attachments.length > 0) {
        const result = await processAttachments(validated.attachments);
        updates.attachments = result.attachments;
        attachmentSummary = result.summary;
      }

      const result = await apiClient.updateTicket(validated.number, updates);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            ticket: result,
            ...(attachmentSummary ? { attachments: attachmentSummary } : {}),
            message: `Ticket ${validated.number} updated successfully${attachmentSummary ? `. ${attachmentSummary}` : ''}`
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
    inputSchema: DeleteTicketInputSchema.shape,
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
    inputSchema: GetParentTicketInputSchema.shape,
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
    inputSchema: GetChildTicketsInputSchema.shape,
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
    inputSchema: CreateSubticketLinkInputSchema.shape,
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
    inputSchema: UnlinkSubticketInputSchema.shape,
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
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down...');
  await server.close();
  process.exit(0);
});

// Start server
main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
