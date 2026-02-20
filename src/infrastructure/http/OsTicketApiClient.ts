import https from 'https';
import http from 'http';
import type {
  GetParentResponse,
  GetChildrenResponse,
  CreateLinkResponse,
  UnlinkResponse
} from './types/SubticketTypes.js';
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

  constructor(apiUrl: string, apiKey: string, rejectUnauthorized: boolean, logger: Logger) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.rejectUnauthorized = rejectUnauthorized;
    this.logger = logger;
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
  async getTicket(number: string): Promise<unknown> {
    const url = new URL(`/api/tickets-get.php/${number}.json`, this.apiUrl);
    return await this.makeRequest('GET', url.toString());
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
  }): Promise<unknown> {
    const url = new URL('/api/tickets-search.php', this.apiUrl);

    if (params.query) url.searchParams.append('query', params.query);
    if (params.status) url.searchParams.append('status', params.status);
    if (params.departmentId) url.searchParams.append('departmentId', String(params.departmentId));
    if (params.limit) url.searchParams.append('limit', String(params.limit));
    if (params.offset) url.searchParams.append('offset', String(params.offset));

    return await this.makeRequest('GET', url.toString());
  }

  /**
   * Get ticket statistics
   */
  async getTicketStats(): Promise<unknown> {
    const url = new URL('/api/tickets-stats.php', this.apiUrl);
    return await this.makeRequest('GET', url.toString());
  }

  /**
   * Get all ticket statuses
   */
  async getTicketStatuses(): Promise<TicketStatus[]> {
    const url = new URL('/api/tickets-statuses.php', this.apiUrl);
    return await this.makeRequest('GET', url.toString()) as TicketStatus[];
  }

  /**
   * Load ticket statuses from API and cache them
   */
  private async loadStatusesIfNeeded(): Promise<void> {
    if (this.statusCache !== null) {
      return;
    }

    try {
      this.statusCache = await this.getTicketStatuses();
    } catch (error) {
      this.statusCache = [];
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
   * Resolve department name to ID
   */
  private resolveDepartmentId(departmentId: string | number): number {
    if (typeof departmentId === 'number') {
      return departmentId;
    }

    const parsed = parseInt(departmentId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    throw new Error(`Department name lookup not yet supported. Please use department ID (numeric). Received: "${departmentId}"`);
  }

  /**
   * Resolve staff username to ID
   */
  private resolveStaffId(staffId: string | number): number {
    if (typeof staffId === 'number') {
      return staffId;
    }

    const parsed = parseInt(staffId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    throw new Error(`Staff username lookup not yet supported. Please use staff ID (numeric). Received: "${staffId}"`);
  }

  /**
   * Resolve topic name to ID
   */
  private resolveTopicId(topicId: string | number): number {
    if (typeof topicId === 'number') {
      return topicId;
    }

    const parsed = parseInt(topicId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    throw new Error(`Topic name lookup not yet supported. Please use topic ID (numeric). Received: "${topicId}"`);
  }

  /**
   * Resolve SLA name to ID
   */
  private resolveSlaId(slaId: string | number): number {
    if (typeof slaId === 'number') {
      return slaId;
    }

    const parsed = parseInt(slaId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    throw new Error(`SLA name lookup not yet supported. Please use SLA ID (numeric). Received: "${slaId}"`);
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
  }): Promise<unknown> {
    const resolvedUpdates: Record<string, unknown> = {};

    if (updates.statusId !== undefined) {
      resolvedUpdates.statusId = await this.resolveStatusId(updates.statusId);
    }

    if (updates.departmentId !== undefined) {
      resolvedUpdates.departmentId = this.resolveDepartmentId(updates.departmentId);
    }
    if (updates.staffId !== undefined) {
      resolvedUpdates.staffId = this.resolveStaffId(updates.staffId);
    }
    if (updates.topicId !== undefined) {
      resolvedUpdates.topicId = this.resolveTopicId(updates.topicId);
    }
    if (updates.slaId !== undefined) {
      resolvedUpdates.slaId = this.resolveSlaId(updates.slaId);
    }

    if (updates.priorityId !== undefined) resolvedUpdates.priorityId = updates.priorityId;
    if (updates.parentTicketNumber !== undefined) resolvedUpdates.parentTicketNumber = updates.parentTicketNumber;
    if (updates.note !== undefined) resolvedUpdates.note = updates.note;
    if (updates.noteTitle !== undefined) resolvedUpdates.noteTitle = updates.noteTitle;
    if (updates.noteFormat !== undefined) resolvedUpdates.noteFormat = updates.noteFormat;

    if (updates.dueDate !== undefined) resolvedUpdates.dueDate = updates.dueDate;

    const url = new URL(`/api/tickets-update.php/${number}.json`, this.apiUrl);
    return await this.makeRequest('PATCH', url.toString(), resolvedUpdates);
  }

  /**
   * Delete ticket
   */
  async deleteTicket(number: string): Promise<unknown> {
    const url = new URL(`/api/tickets-delete.php/${number}.json`, this.apiUrl);
    return await this.makeRequest('DELETE', url.toString());
  }

  /**
   * Get parent ticket of a subticket
   */
  async getParentTicket(childNumber: string): Promise<GetParentResponse> {
    const url = new URL(`/api/tickets-subtickets-parent.php/${childNumber}.json`, this.apiUrl);
    return await this.makeRequest('GET', url.toString()) as GetParentResponse;
  }

  /**
   * Get list of child tickets (subtickets)
   */
  async getChildTickets(parentNumber: string): Promise<GetChildrenResponse> {
    const url = new URL(`/api/tickets-subtickets-list.php/${parentNumber}.json`, this.apiUrl);
    return await this.makeRequest('GET', url.toString()) as GetChildrenResponse;
  }

  /**
   * Create subticket link
   */
  async createSubticketLink(parentNumber: string, childNumber: string | number): Promise<CreateLinkResponse> {
    const url = new URL(`/api/tickets-subtickets-create.php/${parentNumber}.json`, this.apiUrl);
    return await this.makeRequest('POST', url.toString(), { childId: childNumber }) as CreateLinkResponse;
  }

  /**
   * Unlink subticket
   */
  async unlinkSubticket(childNumber: string): Promise<UnlinkResponse> {
    const url = new URL(`/api/tickets-subtickets-unlink.php/${childNumber}.json`, this.apiUrl);
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

          // Extract error message from response
          let errorMessage: string;
          try {
            const json = JSON.parse(data);
            if (json.error && json.message) {
              errorMessage = json.message;
            } else {
              errorMessage = this.getDefaultErrorMessage(statusCode);
            }
          } catch {
            // For 404 with a meaningful body, use it
            if (statusCode === 404 && data && data.trim() !== '') {
              errorMessage = data.trim();
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
        req.write(JSON.stringify(body));
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
