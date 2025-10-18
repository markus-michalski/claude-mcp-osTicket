import {
  Ticket,
  TicketListItem,
  TicketStatistics,
  TicketFilters
} from '../entities/Ticket.js';

/**
 * Repository Interface for Ticket data access
 * Infrastructure layer will implement this
 */
export interface ITicketRepository {
  /**
   * Find a ticket by ID with all related data
   */
  findById(id: number): Promise<Ticket | null>;

  /**
   * Find a ticket by ticket number
   */
  findByNumber(ticketNumber: string): Promise<Ticket | null>;

  /**
   * List tickets with optional filters
   */
  list(filters?: TicketFilters): Promise<TicketListItem[]>;

  /**
   * Search tickets by query string (subject, number, content)
   */
  search(query: string, limit?: number): Promise<TicketListItem[]>;

  /**
   * Get aggregated statistics
   */
  getStatistics(): Promise<TicketStatistics>;

  /**
   * Health check - verify repository is operational
   */
  healthCheck(): Promise<boolean>;
}
