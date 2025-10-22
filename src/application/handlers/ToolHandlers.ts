import { TicketService } from '../../core/services/TicketService.js';
import { TicketFilters, TicketStatus } from '../../core/entities/Ticket.js';
import { OsTicketApiClient } from '../../infrastructure/http/OsTicketApiClient.js';
import { Configuration } from '../../config/Configuration.js';

/**
 * MCP Tool Handlers
 * Translates MCP tool calls to service calls
 *
 * Note: MetadataService was removed as departmentId/topicId are no longer
 * supported in create_ticket. Will be re-added when update API is implemented.
 */
export class ToolHandlers {
  constructor(
    private readonly ticketService: TicketService,
    private readonly apiClient?: OsTicketApiClient,
    private readonly config?: Configuration
  ) {}

  /**
   * Handle get_ticket tool call
   */
  async handleGetTicket(args: { id?: number; number?: string }): Promise<any> {
    try {
      let ticket;

      if (args.id) {
        ticket = await this.ticketService.getTicket(args.id);
      } else if (args.number) {
        ticket = await this.ticketService.getTicketByNumber(args.number);
      } else {
        return {
          error: 'Either id or number parameter is required'
        };
      }

      if (!ticket) {
        return {
          error: 'Ticket not found'
        };
      }

      return {
        ticket: this.formatTicket(ticket)
      };
    } catch (error) {
      return {
        error: `Failed to get ticket: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle list_tickets tool call
   */
  async handleListTickets(args: {
    status?: string;
    departmentId?: number;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    try {
      const filters: TicketFilters = {
        status: args.status ? this.parseStatus(args.status) : undefined,
        departmentId: args.departmentId,
        limit: args.limit || 20,
        offset: args.offset || 0
      };

      const tickets = await this.ticketService.listTickets(filters);

      return {
        tickets: tickets.map(t => this.formatTicketListItem(t)),
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

      const tickets = await this.ticketService.searchTickets(
        args.query,
        args.limit || 20
      );

      return {
        tickets: tickets.map(t => this.formatTicketListItem(t)),
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
   */
  async handleGetStats(): Promise<any> {
    try {
      const stats = await this.ticketService.getStatistics();

      return {
        statistics: {
          total: stats.total,
          open: stats.open,
          closed: stats.closed,
          overdue: stats.overdue,
          unanswered: stats.unanswered,
          last7Days: stats.last7Days,
          avgFirstResponseHours: Math.round(stats.avgFirstResponseHours * 10) / 10,
          byDepartment: stats.byDepartment
        }
      };
    } catch (error) {
      return {
        error: `Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle create_ticket tool call
   *
   * Note: topicId is supported by the wildcard API
   * - If topicId is provided, it will be used
   * - If not provided, uses OSTICKET_DEFAULT_TOPIC_ID from config (if set)
   * - If no default, uses osTicket's system default help topic
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
  }): Promise<any> {
    try {
      // Check if API client is available
      if (!this.apiClient) {
        return {
          error: 'API client not configured. Set OSTICKET_API_URL and OSTICKET_API_KEY in .env'
        };
      }

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
      // Default to 'markdown' format if not specified
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
   * Format ticket for JSON output
   */
  private formatTicket(ticket: any): any {
    return {
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      department: ticket.department,
      created: ticket.created.toISOString(),
      updated: ticket.updated.toISOString(),
      dueDate: ticket.dueDate?.toISOString(),
      isOverdue: ticket.isOverdue,
      isAnswered: ticket.isAnswered,
      isClosed: ticket.isClosed,
      user: ticket.user,
      assignee: ticket.assignee,
      messages: ticket.messages.map((msg: any) => ({
        id: msg.id,
        created: msg.created.toISOString(),
        author: msg.author,
        type: msg.type,
        title: msg.title,
        body: msg.body,
        isStaffReply: msg.isStaffReply
      })),
      replyCount: ticket.replyCount,
      lastResponseAt: ticket.lastResponseAt?.toISOString()
    };
  }

  /**
   * Format ticket list item for JSON output
   */
  private formatTicketListItem(item: any): any {
    return {
      id: item.id,
      number: item.number,
      subject: item.subject,
      status: item.status,
      created: item.created.toISOString(),
      updated: item.updated.toISOString(),
      isOverdue: item.isOverdue,
      userName: item.userName,
      departmentName: item.departmentName,
      replyCount: item.replyCount,
      lastResponseAt: item.lastResponseAt?.toISOString()
    };
  }

  /**
   * Parse status string to enum
   */
  private parseStatus(status: string): TicketStatus {
    switch (status.toLowerCase()) {
      case 'open': return TicketStatus.OPEN;
      case 'closed': return TicketStatus.CLOSED;
      case 'resolved': return TicketStatus.RESOLVED;
      case 'archived': return TicketStatus.ARCHIVED;
      default: return TicketStatus.OPEN;
    }
  }
}
