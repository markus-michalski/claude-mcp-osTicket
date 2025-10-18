import { ITicketRepository } from '../repositories/ITicketRepository.js';
import { ICacheProvider } from '../repositories/ICacheProvider.js';
import {
  Ticket,
  TicketListItem,
  TicketStatistics,
  TicketFilters
} from '../entities/Ticket.js';

/**
 * Ticket Service - Business Logic Layer
 * Orchestrates repository calls and caching
 */
export class TicketService {
  private readonly CACHE_PREFIX = 'ticket:';
  private readonly DEFAULT_TTL = 300000; // 5 minutes

  constructor(
    private readonly repository: ITicketRepository,
    private readonly cache: ICacheProvider
  ) {}

  /**
   * Get a ticket by ID with caching
   */
  async getTicket(id: number): Promise<Ticket | null> {
    const cacheKey = this.getCacheKey('id', id);

    // Try cache first
    const cached = await this.cache.get<Ticket>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from repository
    const ticket = await this.repository.findById(id);

    // Cache if found
    if (ticket) {
      await this.cache.set(cacheKey, ticket, this.DEFAULT_TTL);
    }

    return ticket;
  }

  /**
   * Get a ticket by number with caching
   */
  async getTicketByNumber(ticketNumber: string): Promise<Ticket | null> {
    const cacheKey = this.getCacheKey('number', ticketNumber);

    // Try cache first
    const cached = await this.cache.get<Ticket>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from repository
    const ticket = await this.repository.findByNumber(ticketNumber);

    // Cache if found
    if (ticket) {
      await this.cache.set(cacheKey, ticket, this.DEFAULT_TTL);
    }

    return ticket;
  }

  /**
   * List tickets with optional filters
   */
  async listTickets(filters?: TicketFilters): Promise<TicketListItem[]> {
    const cacheKey = this.getCacheKey('list', JSON.stringify(filters || {}));

    // Try cache first
    const cached = await this.cache.get<TicketListItem[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from repository
    const tickets = await this.repository.list(filters);

    // Cache result
    await this.cache.set(cacheKey, tickets, this.DEFAULT_TTL);

    return tickets;
  }

  /**
   * Search tickets by query
   */
  async searchTickets(query: string, limit?: number): Promise<TicketListItem[]> {
    // Search results are cached shorter (2 minutes) as they're more dynamic
    const cacheKey = this.getCacheKey('search', `${query}:${limit || 20}`);
    const searchTTL = 120000; // 2 minutes

    const cached = await this.cache.get<TicketListItem[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const results = await this.repository.search(query, limit);
    await this.cache.set(cacheKey, results, searchTTL);

    return results;
  }

  /**
   * Get ticket statistics
   */
  async getStatistics(): Promise<TicketStatistics> {
    const cacheKey = this.getCacheKey('stats', 'all');

    const cached = await this.cache.get<TicketStatistics>(cacheKey);
    if (cached) {
      return cached;
    }

    const stats = await this.repository.getStatistics();
    await this.cache.set(cacheKey, stats, this.DEFAULT_TTL);

    return stats;
  }

  /**
   * Invalidate cache for a specific ticket
   * Useful after ticket updates (though we're readonly)
   */
  async invalidateTicket(ticketId: number): Promise<void> {
    await this.cache.delete(this.getCacheKey('id', ticketId));
  }

  /**
   * Invalidate all ticket caches
   */
  async invalidateAll(): Promise<void> {
    await this.cache.invalidatePattern(`${this.CACHE_PREFIX}*`);
  }

  /**
   * Health check - verify service is operational
   */
  async healthCheck(): Promise<boolean> {
    return await this.repository.healthCheck();
  }

  /**
   * Get cache key with consistent format
   */
  private getCacheKey(type: string, identifier: string | number): string {
    return `${this.CACHE_PREFIX}${type}:${identifier}`;
  }
}
