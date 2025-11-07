import { OsTicketApiClient } from '../../infrastructure/http/OsTicketApiClient.js';
import { Configuration } from '../../config/Configuration.js';

/**
 * MCP Tool Handlers
 * Translates MCP tool calls to API calls
 *
 * All handlers now use the REST API exclusively (no direct database access)
 */
export class ToolHandlers {
  constructor(
    private readonly apiClient: OsTicketApiClient,
    private readonly config?: Configuration
  ) {}

  /**
   * Handle get_ticket tool call
   * Uses GET /api/tickets-get.php/:number.json
   */
  async handleGetTicket(args: { id?: number; number?: string }): Promise<any> {
    try {
      // Validate input
      if (!args.number && !args.id) {
        return {
          error: 'Either id or number parameter is required'
        };
      }

      // Use number if provided, otherwise use id as number
      const ticketNumber = args.number || String(args.id);

      // Get ticket via API
      const ticket = await this.apiClient.getTicket(ticketNumber);

      return {
        ticket
      };
    } catch (error) {
      return {
        error: `Failed to get ticket: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle list_tickets tool call
   * Uses GET /api/tickets-search.php
   */
  async handleListTickets(args: {
    status?: string;
    departmentId?: number;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    try {
      // Search tickets via API (without query = list all)
      // API returns array directly: [{...}, {...}]
      const result = await this.apiClient.searchTickets({
        status: args.status,
        departmentId: args.departmentId,
        limit: args.limit || 20,
        offset: args.offset || 0
      });

      // result is already the array
      const tickets = Array.isArray(result) ? result : [];

      return {
        tickets: tickets,
        total: tickets.length
      };
    } catch (error) {
      return {
        error: `Failed to list tickets: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle search_tickets tool call
   * Uses GET /api/tickets-search.php?query=...
   */
  async handleSearchTickets(args: {
    query: string;
    limit?: number;
  }): Promise<any> {
    try {
      if (!args.query || args.query.trim().length === 0) {
        return {
          error: 'Query parameter is required'
        };
      }

      // Search tickets via API
      // API returns array directly: [{...}, {...}]
      const result = await this.apiClient.searchTickets({
        query: args.query,
        limit: args.limit || 20
      });

      // result is already the array
      const tickets = Array.isArray(result) ? result : [];

      return {
        tickets: tickets,
        total: tickets.length,
        query: args.query
      };
    } catch (error) {
      return {
        error: `Failed to search tickets: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle get_ticket_stats tool call
   * Uses GET /api/tickets-stats.php
   */
  async handleGetStats(): Promise<any> {
    try {
      const stats = await this.apiClient.getTicketStats();

      return {
        statistics: stats
      };
    } catch (error) {
      return {
        error: `Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle create_ticket tool call
   * POST /api/wildcard/tickets.json
   *
   * Format parameter:
   * - "markdown" - Content will be parsed as Markdown (DEFAULT)
   * - "html" - Content will be treated as HTML
   * - "text" - Content will be treated as plain text
   */
  async handleCreateTicket(args: {
    name?: string;
    email?: string;
    subject: string;
    message: string;
    format?: 'markdown' | 'html' | 'text';
    topicId?: number;
    departmentId?: string | number;
  }): Promise<any> {
    try {
      // Use defaults from config if not provided
      const name = args.name?.trim() || this.config?.osTicketDefaultName || '';
      const email = args.email?.trim() || this.config?.osTicketDefaultEmail || '';
      const topicId = args.topicId || this.config?.osTicketDefaultTopicId || undefined;

      // Validate required fields (after applying defaults)
      if (!name || name.length === 0) {
        return { error: 'Name parameter is required (provide name or set OSTICKET_DEFAULT_NAME in .env)' };
      }

      if (!email || email.length === 0) {
        return { error: 'Email parameter is required (provide email or set OSTICKET_DEFAULT_EMAIL in .env)' };
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return { error: 'Invalid email format' };
      }

      if (!args.subject || args.subject.trim().length === 0) {
        return { error: 'Subject parameter is required' };
      }

      if (!args.message || args.message.trim().length === 0) {
        return { error: 'Message parameter is required' };
      }

      // Create ticket via API
      const ticketNumber = await this.apiClient.createTicket({
        name: name,
        email: email,
        subject: args.subject.trim(),
        message: args.message.trim(),
        format: args.format || 'markdown',
        topicId: topicId,
        alert: false,
        autorespond: false
      });

      return {
        success: true,
        ticketNumber,
        message: `Ticket created successfully with number: ${ticketNumber}${topicId ? ` with topic ID ${topicId}` : ''}.`
      };
    } catch (error) {
      return {
        error: `Failed to create ticket: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle update_ticket tool call
   * PATCH /api/tickets-update.php/:number.json
   */
  async handleUpdateTicket(args: {
    number: string;
    departmentId?: string | number;
    statusId?: string | number;
    topicId?: string | number;
    staffId?: string | number;
    slaId?: string | number;
    parentTicketNumber?: string;
    note?: string;
    noteTitle?: string;
    noteFormat?: string;
  }): Promise<any> {
    try {
      if (!args.number || args.number.trim().length === 0) {
        return { error: 'Ticket number is required' };
      }

      // Build updates object (only include provided fields)
      const updates: any = {};
      if (args.departmentId !== undefined) updates.departmentId = args.departmentId;
      if (args.statusId !== undefined) updates.statusId = args.statusId;
      if (args.topicId !== undefined) updates.topicId = args.topicId;
      if (args.staffId !== undefined) updates.staffId = args.staffId;
      if (args.slaId !== undefined) updates.slaId = args.slaId;
      if (args.parentTicketNumber !== undefined) updates.parentTicketNumber = args.parentTicketNumber;
      if (args.note !== undefined) updates.note = args.note;
      if (args.noteTitle !== undefined) updates.noteTitle = args.noteTitle;
      if (args.noteFormat !== undefined) updates.noteFormat = args.noteFormat;

      // Check if at least one field is being updated
      if (Object.keys(updates).length === 0) {
        return { error: 'At least one field must be provided for update' };
      }

      // Update ticket via API
      const result = await this.apiClient.updateTicket(args.number, updates);

      return {
        success: true,
        ticket: result,
        message: `Ticket ${args.number} updated successfully`
      };
    } catch (error) {
      return {
        error: `Failed to update ticket: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle delete_ticket tool call
   * DELETE /api/tickets-delete.php/:number.json
   */
  async handleDeleteTicket(args: { number: string }): Promise<any> {
    try {
      if (!args.number || args.number.trim().length === 0) {
        return { error: 'Ticket number is required' };
      }

      // Delete ticket via API
      await this.apiClient.deleteTicket(args.number);

      return {
        success: true,
        message: `Ticket ${args.number} deleted successfully`
      };
    } catch (error) {
      return {
        error: `Failed to delete ticket: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle get_parent_ticket tool call
   * GET /api/tickets-subtickets-parent.php/:number.json
   *
   * Gets the parent ticket of a subticket
   */
  async handleGetParentTicket(args: { number: string }): Promise<any> {
    try {
      if (!args.number || args.number.trim().length === 0) {
        return { error: 'Ticket number is required' };
      }

      // Get parent ticket via API
      const result = await this.apiClient.getParentTicket(args.number);

      return {
        success: true,
        parent: result.parent,
        message: `Parent ticket retrieved for ticket ${args.number}`
      };
    } catch (error) {
      return {
        error: `Failed to get parent ticket: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle get_child_tickets tool call
   * GET /api/tickets-subtickets-list.php/:number.json
   *
   * Gets the list of child tickets (subtickets) for a parent ticket
   */
  async handleGetChildTickets(args: { number: string }): Promise<any> {
    try {
      if (!args.number || args.number.trim().length === 0) {
        return { error: 'Ticket number is required' };
      }

      // Get child tickets via API
      const result = await this.apiClient.getChildTickets(args.number);

      // API returns: { children: [...] }
      const children = result.children || [];

      return {
        success: true,
        children: children,
        total: children.length,
        message: `Found ${children.length} child ticket(s) for ticket ${args.number}`
      };
    } catch (error) {
      return {
        error: `Failed to get child tickets: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle create_subticket_link tool call
   * POST /api/tickets-subtickets-create.php/:parentNumber.json
   *
   * Creates a parent-child relationship between two tickets
   */
  async handleCreateSubticketLink(args: {
    parentNumber: string;
    childNumber: string;
  }): Promise<any> {
    try {
      if (!args.parentNumber || args.parentNumber.trim().length === 0) {
        return { error: 'Parent ticket number is required' };
      }

      if (!args.childNumber || args.childNumber.trim().length === 0) {
        return { error: 'Child ticket number is required' };
      }

      // Create subticket link via API
      const result = await this.apiClient.createSubticketLink(
        args.parentNumber,
        args.childNumber
      );

      return {
        success: true,
        result: result,
        message: `Subticket link created: ${args.childNumber} is now a child of ${args.parentNumber}`
      };
    } catch (error) {
      return {
        error: `Failed to create subticket link: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle unlink_subticket tool call
   * DELETE /api/tickets-subtickets-unlink.php/:childNumber.json
   *
   * Removes the parent-child relationship (unlinks subticket from parent)
   */
  async handleUnlinkSubticket(args: { number: string }): Promise<any> {
    try {
      if (!args.number || args.number.trim().length === 0) {
        return { error: 'Ticket number is required' };
      }

      // Unlink subticket via API
      const result = await this.apiClient.unlinkSubticket(args.number);

      return {
        success: true,
        result: result,
        message: `Subticket ${args.number} has been unlinked from its parent`
      };
    } catch (error) {
      return {
        error: `Failed to unlink subticket: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}
