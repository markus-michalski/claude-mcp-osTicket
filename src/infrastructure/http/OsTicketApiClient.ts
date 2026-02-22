import https from 'https';
import http from 'http';
import type {
  GetParentResponse,
  GetChildrenResponse,
  CreateLinkResponse,
  UnlinkResponse
} from './types/SubticketTypes.js';
import type {
  TicketDetailResponse,
  TicketSummary,
  TicketStatsResponse,
  UpdateTicketResponse,
  DeleteTicketResponse
} from './types/ApiResponseTypes.js';
import { OsTicketApiError } from '../errors/OsTicketApiError.js';
import { API_TIMEOUT_MS } from '../../constants.js';
import type { Logger } from '../logging/Logger.js';

// Maximum response size to prevent OOM from malicious/broken backends
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB

// Retry configuration for transient errors
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);

/** HTTP request options (typed instead of any) */
interface HttpRequestOptions {
  method: string;
  hostname: string;
  port?: string;
  path: string;
  headers: Record<string, string>;
  rejectUnauthorized: boolean;
}

/** Ticket status entry from API */
interface TicketStatus {
  id: number;
  name: string;
  state: string;
}

/**
 * osTicket API Client
 * Handles HTTP communication with osTicket REST API
 */
export class OsTicketApiClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly rejectUnauthorized: boolean;
  private readonly logger: Logger;
  private statusCache: TicketStatus[] | null = null;
  private statusCacheExpiry: number = 0;
  private static readonly STATUS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(apiUrl: string, apiKey: string, rejectUnauthorized: boolean, logger: Logger) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.rejectUnauthorized = rejectUnauthorized;
    this.logger = logger;

    if (!rejectUnauthorized) {
      this.logger.warn('SSL certificate verification disabled - INSECURE configuration');
    }
  }

  /**
   * Defense-in-depth: validate and encode a ticket number for safe URL inclusion
   */
  private safeTicketNumber(number: string, context: string): string {
    if (!/^\d+$/.test(number) || number.length > 20) {
      throw new Error(`Invalid ticket number in ${context}: must be 1-20 digits`);
    }
    return encodeURIComponent(number);
  }

  /**
   * Create a new ticket via API
   * Uses wildcard endpoint to support API keys with 0.0.0.0 IP address
   */
  async createTicket(params: {
    name: string;
    email: string;
    subject: string;
    message: string;
    format?: 'markdown' | 'html' | 'text';
    topicId?: number;
    alert?: boolean;
    autorespond?: boolean;
    attachments?: Array<Record<string, string>>;
  }): Promise<string> {
    const url = new URL('/api/wildcard/tickets.json', this.apiUrl);

    const body: Record<string, unknown> = {
      name: params.name,
      email: params.email,
      subject: params.subject,
      message: params.message,
      alert: params.alert ?? false,
      autorespond: params.autorespond ?? false,
    };

    if (params.format) {
      body.format = params.format;
    }

    if (params.topicId) {
      body.topicId = params.topicId;
    }

    if (params.attachments && params.attachments.length > 0) {
      body.attachments = params.attachments;
    }

    const response = await this.makeRequest('POST', url.toString(), body);

    // osTicket wildcard API can return ticket number in different formats
    if (typeof response === 'number') {
      return String(response);
    }

    if (typeof response === 'string') {
      return response.trim();
    }

    if (typeof response === 'object' && response !== null) {
      const obj = response as Record<string, unknown>;
      if ('ticketNumber' in obj) {
        return String(obj.ticketNumber);
      }
      if ('number' in obj) {
        return String(obj.number);
      }
    }

    // Don't leak response content - only log type and length
    throw new Error(`Failed to extract ticket number from API response (type: ${typeof response}, length: ${JSON.stringify(response).length})`);
  }

  /**
   * Get ticket details by number
   */
  async getTicket(number: string): Promise<TicketDetailResponse> {
    const safe = this.safeTicketNumber(number, 'getTicket');
    const url = new URL(`/api/tickets-get.php/${safe}.json`, this.apiUrl);
    return await this.makeRequest('GET', url.toString()) as TicketDetailResponse;
  }

  /**
   * Search tickets
   */
  async searchTickets(params: {
    query?: string;
    status?: string;
    departmentId?: string | number;
    limit?: number;
    offset?: number;
  }): Promise<TicketSummary[]> {
    const url = new URL('/api/tickets-search.php', this.apiUrl);

    if (params.query) url.searchParams.append('query', params.query);
    if (params.status) url.searchParams.append('status', params.status);
    if (params.departmentId) url.searchParams.append('departmentId', String(params.departmentId));
    if (params.limit) url.searchParams.append('limit', String(params.limit));
    if (params.offset) url.searchParams.append('offset', String(params.offset));

    return await this.makeRequest('GET', url.toString()) as TicketSummary[];
  }

  /**
   * Get ticket statistics
   */
  async getTicketStats(): Promise<TicketStatsResponse> {
    const url = new URL('/api/tickets-stats.php', this.apiUrl);
    return await this.makeRequest('GET', url.toString()) as TicketStatsResponse;
  }

  /**
   * Get all ticket statuses
   */
  async getTicketStatuses(): Promise<TicketStatus[]> {
    const url = new URL('/api/tickets-statuses.php', this.apiUrl);
    return await this.makeRequest('GET', url.toString()) as TicketStatus[];
  }

  /**
   * Load ticket statuses from API and cache them with TTL
   */
  private async loadStatusesIfNeeded(): Promise<void> {
    if (this.statusCache !== null && Date.now() < this.statusCacheExpiry) {
      return;
    }

    try {
      this.statusCache = await this.getTicketStatuses();
      this.statusCacheExpiry = Date.now() + OsTicketApiClient.STATUS_CACHE_TTL_MS;
    } catch (error) {
      // Keep stale cache on refresh failure, only set empty on first load
      if (this.statusCache === null) {
        this.statusCache = [];
      }
      this.logger.warn(`Failed to load ticket statuses from API: ${error}`);
    }
  }

  /**
   * Resolve status name to ID
   */
  private async resolveStatusId(statusId: string | number): Promise<number> {
    if (typeof statusId === 'number') {
      return statusId;
    }

    const parsed = parseInt(statusId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    await this.loadStatusesIfNeeded();

    const normalized = statusId.toLowerCase().trim();
    const status = this.statusCache?.find(s => s.name.toLowerCase() === normalized);

    if (status) {
      return status.id;
    }

    const availableNames = this.statusCache?.map(s => s.name).join(', ') || 'none';
    throw new Error(`Invalid status: "${statusId}". Available statuses: ${availableNames}`);
  }

  /**
   * Resolve a string|number entity reference to a numeric ID.
   * Name lookup is not yet supported for these entities.
   */
  private resolveNumericId(value: string | number, entityName: string): number {
    if (typeof value === 'number') return value;
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) return parsed;
    throw new Error(
      `${entityName} name lookup not yet supported. Please use ${entityName} ID (numeric). Received: "${value}"`
    );
  }

  /**
   * Update ticket
   */
  async updateTicket(number: string, updates: {
    departmentId?: string | number;
    statusId?: string | number;
    priorityId?: string | number;
    topicId?: string | number;
    staffId?: string | number;
    slaId?: string | number;
    dueDate?: string | null;
    parentTicketNumber?: string;
    note?: string;
    noteTitle?: string;
    noteFormat?: string;
    attachments?: Array<Record<string, string>>;
  }): Promise<UpdateTicketResponse> {
    const resolvedUpdates: Record<string, unknown> = {};

    if (updates.statusId !== undefined) {
      resolvedUpdates.statusId = await this.resolveStatusId(updates.statusId);
    }

    if (updates.departmentId !== undefined) {
      resolvedUpdates.departmentId = this.resolveNumericId(updates.departmentId, 'Department');
    }
    if (updates.staffId !== undefined) {
      resolvedUpdates.staffId = this.resolveNumericId(updates.staffId, 'Staff');
    }
    if (updates.topicId !== undefined) {
      resolvedUpdates.topicId = this.resolveNumericId(updates.topicId, 'Topic');
    }
    if (updates.slaId !== undefined) {
      resolvedUpdates.slaId = this.resolveNumericId(updates.slaId, 'SLA');
    }

    if (updates.priorityId !== undefined) resolvedUpdates.priorityId = updates.priorityId;
    if (updates.parentTicketNumber !== undefined) resolvedUpdates.parentTicketNumber = updates.parentTicketNumber;
    if (updates.note !== undefined) resolvedUpdates.note = updates.note;
    if (updates.noteTitle !== undefined) resolvedUpdates.noteTitle = updates.noteTitle;
    if (updates.noteFormat !== undefined) resolvedUpdates.noteFormat = updates.noteFormat;

    if (updates.dueDate !== undefined) resolvedUpdates.dueDate = updates.dueDate;
    if (updates.attachments && updates.attachments.length > 0) {
      resolvedUpdates.attachments = updates.attachments;
    }

    const safe = this.safeTicketNumber(number, 'updateTicket');
    const url = new URL(`/api/tickets-update.php/${safe}.json`, this.apiUrl);
    return await this.makeRequest('PATCH', url.toString(), resolvedUpdates) as UpdateTicketResponse;
  }

  /**
   * Delete ticket
   */
  async deleteTicket(number: string): Promise<DeleteTicketResponse> {
    const safe = this.safeTicketNumber(number, 'deleteTicket');
    const url = new URL(`/api/tickets-delete.php/${safe}.json`, this.apiUrl);
    return await this.makeRequest('DELETE', url.toString()) as DeleteTicketResponse;
  }

  /**
   * Get parent ticket of a subticket
   */
  async getParentTicket(childNumber: string): Promise<GetParentResponse> {
    const safe = this.safeTicketNumber(childNumber, 'getParentTicket');
    const url = new URL(`/api/tickets-subtickets-parent.php/${safe}.json`, this.apiUrl);
    return await this.makeRequest('GET', url.toString()) as GetParentResponse;
  }

  /**
   * Get list of child tickets (subtickets)
   */
  async getChildTickets(parentNumber: string): Promise<GetChildrenResponse> {
    const safe = this.safeTicketNumber(parentNumber, 'getChildTickets');
    const url = new URL(`/api/tickets-subtickets-list.php/${safe}.json`, this.apiUrl);
    return await this.makeRequest('GET', url.toString()) as GetChildrenResponse;
  }

  /**
   * Create subticket link
   */
  async createSubticketLink(parentNumber: string, childNumber: string | number): Promise<CreateLinkResponse> {
    const safe = this.safeTicketNumber(parentNumber, 'createSubticketLink');
    const url = new URL(`/api/tickets-subtickets-create.php/${safe}.json`, this.apiUrl);
    return await this.makeRequest('POST', url.toString(), { childId: childNumber }) as CreateLinkResponse;
  }

  /**
   * Unlink subticket
   */
  async unlinkSubticket(childNumber: string): Promise<UnlinkResponse> {
    const safe = this.safeTicketNumber(childNumber, 'unlinkSubticket');
    const url = new URL(`/api/tickets-subtickets-unlink.php/${safe}.json`, this.apiUrl);
    return await this.makeRequest('DELETE', url.toString()) as UnlinkResponse;
  }

  /**
   * Make HTTP request with retry logic for transient errors
   */
  private async makeRequest(
    method: string,
    url: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.executeRequest(method, url, body);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on transient errors (network issues or 5xx)
        const isRetryable = (error instanceof OsTicketApiError && RETRYABLE_STATUS_CODES.has(error.statusCode))
          || (lastError.message.includes('ECONNRESET'))
          || (lastError.message.includes('ECONNREFUSED'))
          || (lastError.message.includes('timeout'));

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw lastError;
        }

        // Exponential backoff
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        this.logger.warn(`Request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${lastError.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Execute a single HTTP request
   */
  private executeRequest(
    method: string,
    url: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';

      const options: HttpRequestOptions = {
        method,
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: this.rejectUnauthorized,
      };

      if (parsedUrl.port) {
        options.port = parsedUrl.port;
      }

      const client = isHttps ? https : http;
      const req = client.request(options, (res) => {
        let data = '';
        let dataSize = 0;

        res.on('data', (chunk: Buffer) => {
          dataSize += chunk.length;
          if (dataSize > MAX_RESPONSE_SIZE) {
            req.destroy(new Error(`Response too large (>${MAX_RESPONSE_SIZE / 1024 / 1024} MB)`));
            return;
          }
          data += chunk;
        });

        res.on('end', () => {
          const statusCode = res.statusCode || 500;

          if (statusCode >= 200 && statusCode < 300) {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch {
              resolve(data);
            }
            return;
          }

          // Extract error message from response body
          let errorMessage: string;
          try {
            const json = JSON.parse(data);
            // Support both {error, message} and {message} structures.
            // Use ?? to avoid falsy-value bugs (empty string is a valid message).
            errorMessage = json.message ?? json.error ?? this.getDefaultErrorMessage(statusCode);
          } catch {
            // Non-JSON response (e.g. text/plain from osTicket) —
            // use the raw body for ALL status codes, not just 404
            if (data && data.trim() !== '') {
              // Truncate raw body to prevent huge error messages (e.g. HTML error pages)
              errorMessage = data.trim().substring(0, 500);
            } else {
              errorMessage = this.getDefaultErrorMessage(statusCode);
            }
          }

          reject(new OsTicketApiError(statusCode, `osTicket API error: ${errorMessage}`));
        });
      });

      req.setTimeout(API_TIMEOUT_MS, () => {
        req.destroy();
        reject(new Error(`Request timeout after ${API_TIMEOUT_MS / 1000} seconds`));
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      if (body) {
        const bodyString = JSON.stringify(body);
        // Set Content-Length explicitly to avoid chunked encoding.
        // Apache mod_proxy_fcgi can truncate chunked bodies for larger
        // payloads, causing php://input to be empty/incomplete on the server.
        req.setHeader('Content-Length', Buffer.byteLength(bodyString, 'utf-8'));
        req.write(bodyString);
      }

      req.end();
    });
  }

  /**
   * Get default error message for HTTP status code
   */
  private getDefaultErrorMessage(statusCode: number): string {
    const errorMap: Record<number, string> = {
      400: 'Bad Request - Invalid parameters',
      401: 'Unauthorized - Invalid API key',
      403: 'Forbidden - Access denied',
      404: 'Not Found - Resource not found',
      422: 'Unprocessable Entity - Duplicate or invalid relationship',
      500: 'Internal Server Error - osTicket API error',
      501: 'Not Implemented - Subticket plugin not available',
      502: 'Bad Gateway - Backend server error',
      503: 'Service Unavailable - Server temporarily unavailable',
      504: 'Gateway Timeout - Backend server timeout',
    };

    return errorMap[statusCode] || `HTTP ${statusCode}`;
  }

  /**
   * Health check - verify API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = new URL('/api/tickets-stats.php', this.apiUrl);
      await this.executeRequest('GET', url.toString());
      return true;
    } catch {
      return false;
    }
  }
}
