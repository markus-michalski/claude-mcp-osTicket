import https from 'https';
import http from 'http';
import type {
  GetParentResponse,
  GetChildrenResponse,
  CreateLinkResponse,
  UnlinkResponse
} from './types/SubticketTypes.js';

/**
 * osTicket API Client
 * Handles HTTP communication with osTicket REST API
 */
export class OsTicketApiClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly rejectUnauthorized: boolean;
  private statusCache: Array<{id: number; name: string; state: string}> | null = null;

  constructor(apiUrl: string, apiKey: string, rejectUnauthorized: boolean = false) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.rejectUnauthorized = rejectUnauthorized;
  }

  /**
   * Create a new ticket via API
   * Uses wildcard endpoint to support API keys with 0.0.0.0 IP address
   *
   * Note: topicId is now supported by the wildcard API
   * - topicId determines the department and help topic
   * - If not provided, uses osTicket's default help topic
   *
   * Format parameter:
   * - "markdown" - Content will be parsed as Markdown (DEFAULT)
   * - "html" - Content will be treated as HTML
   * - "text" - Content will be treated as plain text
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
    // Use wildcard endpoint for API keys with 0.0.0.0 (accepts from any IP)
    const url = new URL('/api/wildcard/tickets.json', this.apiUrl);

    const body: any = {
      name: params.name,
      email: params.email,
      subject: params.subject,
      message: params.message,
      alert: params.alert ?? false,
      autorespond: params.autorespond ?? false,
    };

    // Add format if provided (for Markdown support)
    if (params.format) {
      body.format = params.format;
    }

    // Add topicId if provided
    if (params.topicId) {
      body.topicId = params.topicId;
    }

    const response = await this.makeRequest('POST', url.toString(), body);

    // osTicket wildcard API can return ticket number in different formats:
    // - String: "123456"
    // - Number: 123456
    // - JSON object: { ticketNumber: "123456" } or { number: "123456" }

    // Handle number response (wildcard API)
    if (typeof response === 'number') {
      return String(response);
    }

    // Handle string response (standard API)
    if (typeof response === 'string') {
      return response.trim();
    }

    // Handle JSON object response
    if (typeof response === 'object' && response !== null) {
      if ('ticketNumber' in response) {
        return String((response as any).ticketNumber);
      }
      if ('number' in response) {
        return String((response as any).number);
      }
    }

    throw new Error(`Failed to extract ticket number from API response (type: ${typeof response}, value: ${JSON.stringify(response)})`);
  }

  /**
   * Get ticket details by number
   * GET /api/tickets-get.php/:number.json
   */
  async getTicket(number: string): Promise<any> {
    const url = new URL(`/api/tickets-get.php/${number}.json`, this.apiUrl);
    return await this.makeRequest('GET', url.toString());
  }

  /**
   * Search tickets
   * GET /api/tickets-search.php
   */
  async searchTickets(params: {
    query?: string;
    status?: string;
    departmentId?: string | number;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const url = new URL('/api/tickets-search.php', this.apiUrl);

    // Add query parameters
    if (params.query) url.searchParams.append('query', params.query);
    if (params.status) url.searchParams.append('status', params.status);
    if (params.departmentId) url.searchParams.append('departmentId', String(params.departmentId));
    if (params.limit) url.searchParams.append('limit', String(params.limit));
    if (params.offset) url.searchParams.append('offset', String(params.offset));

    return await this.makeRequest('GET', url.toString());
  }

  /**
   * Get ticket statistics
   * GET /api/tickets-stats.php
   */
  async getTicketStats(): Promise<any> {
    const url = new URL('/api/tickets-stats.php', this.apiUrl);
    return await this.makeRequest('GET', url.toString());
  }

  /**
   * Get all ticket statuses
   * GET /api/tickets-statuses.php
   *
   * Returns array of statuses: [{"id": 1, "name": "Open", "state": "open"}, ...]
   */
  async getTicketStatuses(): Promise<Array<{id: number; name: string; state: string}>> {
    const url = new URL('/api/tickets-statuses.php', this.apiUrl);
    return await this.makeRequest('GET', url.toString());
  }

  /**
   * Load ticket statuses from API and cache them
   * Only loads once per instance lifecycle
   */
  private async loadStatusesIfNeeded(): Promise<void> {
    if (this.statusCache !== null) {
      return; // Already loaded
    }

    try {
      this.statusCache = await this.getTicketStatuses();
    } catch (error) {
      // If status endpoint fails, fall back to empty cache
      // This allows the system to still work with numeric IDs
      this.statusCache = [];
      // Note: Logging moved to stderr to avoid stdout pollution in MCP context
      process.stderr.write(`[OsTicketApiClient] Warning: Failed to load ticket statuses from API: ${error}\n`);
    }
  }

  /**
   * Resolve status name to ID
   * Dynamically looks up status from API on first call, then caches
   */
  private async resolveStatusId(statusId: string | number): Promise<number> {
    // If already a number, return it
    if (typeof statusId === 'number') {
      return statusId;
    }

    // Try to parse as number first
    const parsed = parseInt(statusId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    // Load statuses from API if not cached
    await this.loadStatusesIfNeeded();

    // Find status by name (case-insensitive)
    const normalized = statusId.toLowerCase().trim();
    const status = this.statusCache?.find(s => s.name.toLowerCase() === normalized);

    if (status) {
      return status.id;
    }

    // Build helpful error message with available status names
    const availableNames = this.statusCache?.map(s => s.name).join(', ') || 'none';
    throw new Error(`Invalid status: "${statusId}". Available statuses: ${availableNames}`);
  }

  /**
   * Resolve department name to ID
   * Note: This requires a ticket lookup to get the department mapping
   * For now, only numeric IDs are supported
   */
  private resolveDepartmentId(departmentId: string | number): number {
    if (typeof departmentId === 'number') {
      return departmentId;
    }

    // Try to parse as number
    const parsed = parseInt(departmentId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    // Department name lookup not yet implemented
    throw new Error(`Department name lookup not yet supported. Please use department ID (numeric). Received: "${departmentId}"`);
  }

  /**
   * Resolve staff username to ID
   */
  private resolveStaffId(staffId: string | number): number {
    if (typeof staffId === 'number') {
      return staffId;
    }

    // Try to parse as number
    const parsed = parseInt(staffId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    // Staff username lookup not yet implemented
    throw new Error(`Staff username lookup not yet supported. Please use staff ID (numeric). Received: "${staffId}"`);
  }

  /**
   * Resolve topic name to ID
   */
  private resolveTopicId(topicId: string | number): number {
    if (typeof topicId === 'number') {
      return topicId;
    }

    // Try to parse as number
    const parsed = parseInt(topicId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    // Topic name lookup not yet implemented
    throw new Error(`Topic name lookup not yet supported. Please use topic ID (numeric). Received: "${topicId}"`);
  }

  /**
   * Resolve SLA name to ID
   */
  private resolveSlaId(slaId: string | number): number {
    if (typeof slaId === 'number') {
      return slaId;
    }

    // Try to parse as number
    const parsed = parseInt(slaId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }

    // SLA name lookup not yet implemented
    throw new Error(`SLA name lookup not yet supported. Please use SLA ID (numeric). Received: "${slaId}"`);
  }

  /**
   * Update ticket
   * PATCH /api/tickets-update.php/:number.json
   *
   * Converts string values to IDs where supported:
   * - statusId: Dynamically resolved from API (any status name works)
   * - departmentId, staffId, topicId, slaId: numeric only (for now)
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
  }): Promise<any> {
    // Resolve all ID fields (convert names to IDs where supported)
    const resolvedUpdates: any = {};

    // Resolve statusId (async, loads from API on first call)
    if (updates.statusId !== undefined) {
      resolvedUpdates.statusId = await this.resolveStatusId(updates.statusId);
    }

    // Resolve other IDs (sync for now)
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

    // Copy other fields as-is
    if (updates.priorityId !== undefined) resolvedUpdates.priorityId = updates.priorityId;
    if (updates.parentTicketNumber !== undefined) resolvedUpdates.parentTicketNumber = updates.parentTicketNumber;
    if (updates.note !== undefined) resolvedUpdates.note = updates.note;
    if (updates.noteTitle !== undefined) resolvedUpdates.noteTitle = updates.noteTitle;
    if (updates.noteFormat !== undefined) resolvedUpdates.noteFormat = updates.noteFormat;

    // dueDate: pass through as-is (null clears, string sets)
    if (updates.dueDate !== undefined) resolvedUpdates.dueDate = updates.dueDate;

    const url = new URL(`/api/tickets-update.php/${number}.json`, this.apiUrl);
    return await this.makeRequest('PATCH', url.toString(), resolvedUpdates);
  }

  /**
   * Delete ticket
   * DELETE /api/tickets-delete.php/:number.json
   */
  async deleteTicket(number: string): Promise<any> {
    const url = new URL(`/api/tickets-delete.php/${number}.json`, this.apiUrl);
    return await this.makeRequest('DELETE', url.toString());
  }

  /**
   * Get parent ticket of a subticket
   * GET /api/tickets-subtickets-parent.php/:number.json
   *
   * @param childNumber - Child ticket number
   * @returns Promise<GetParentResponse> Parent ticket data or null
   * @throws Error HTTP 400 - Invalid ticket number
   * @throws Error HTTP 403 - Not authorized
   * @throws Error HTTP 404 - Ticket not found
   * @throws Error HTTP 501 - Subticket plugin not available
   */
  async getParentTicket(childNumber: string): Promise<GetParentResponse> {
    const url = new URL(`/api/tickets-subtickets-parent.php/${childNumber}.json`, this.apiUrl);
    return await this.makeRequest('GET', url.toString());
  }

  /**
   * Get list of child tickets (subtickets)
   * GET /api/tickets-subtickets-list.php/:number.json
   *
   * @param parentNumber - Parent ticket number
   * @returns Promise<GetChildrenResponse> Array of child tickets (empty if no children)
   * @throws Error HTTP 400 - Invalid ticket number
   * @throws Error HTTP 403 - Not authorized
   * @throws Error HTTP 404 - Ticket not found
   * @throws Error HTTP 501 - Subticket plugin not available
   */
  async getChildTickets(parentNumber: string): Promise<GetChildrenResponse> {
    const url = new URL(`/api/tickets-subtickets-list.php/${parentNumber}.json`, this.apiUrl);
    return await this.makeRequest('GET', url.toString());
  }

  /**
   * Create subticket link (make ticket a child of another ticket)
   * POST /api/tickets-subtickets-create.php/:parentNumber.json
   *
   * @param parentNumber - Parent ticket number
   * @param childNumber - Child ticket number or ID
   * @returns Promise<CreateLinkResponse> Success response with parent and child data
   * @throws Error HTTP 400 - Invalid ticket numbers or self-link attempt
   * @throws Error HTTP 403 - Not authorized (permission or department access)
   * @throws Error HTTP 404 - Parent or child ticket not found
   * @throws Error HTTP 422 - Child already has a parent
   * @throws Error HTTP 501 - Subticket plugin not available
   */
  async createSubticketLink(parentNumber: string, childNumber: string | number): Promise<CreateLinkResponse> {
    const url = new URL(`/api/tickets-subtickets-create.php/${parentNumber}.json`, this.apiUrl);
    return await this.makeRequest('POST', url.toString(), { childId: childNumber });
  }

  /**
   * Unlink subticket (remove parent-child relationship)
   * DELETE /api/tickets-subtickets-unlink.php/:childNumber.json
   *
   * @param childNumber - Child ticket number to unlink
   * @returns Promise<UnlinkResponse> Success response with child ticket data
   * @throws Error HTTP 400 - Invalid child ticket number
   * @throws Error HTTP 403 - Not authorized (permission or department access)
   * @throws Error HTTP 404 - Child ticket not found or has no parent
   * @throws Error HTTP 501 - Subticket plugin not available
   */
  async unlinkSubticket(childNumber: string): Promise<UnlinkResponse> {
    const url = new URL(`/api/tickets-subtickets-unlink.php/${childNumber}.json`, this.apiUrl);
    return await this.makeRequest('DELETE', url.toString());
  }

  /**
   * Make HTTP request to osTicket API
   */
  private async makeRequest(
    method: string,
    url: string,
    body?: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';

      const options: any = {
        method,
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: this.rejectUnauthorized,
      };

      // Only set port if explicitly specified in URL (not default 443/80)
      if (parsedUrl.port) {
        options.port = parsedUrl.port;
      }

      const client = isHttps ? https : http;
      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const statusCode = res.statusCode || 500;

          // Success
          if (statusCode >= 200 && statusCode < 300) {
            // Try to parse JSON, fallback to raw text
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch {
              // osTicket API returns ticket number as plain text
              resolve(data);
            }
            return;
          }

          // Error handling
          const errorMap: Record<number, string> = {
            400: 'Bad Request - Invalid parameters',
            401: 'Unauthorized - Invalid API key',
            403: 'Forbidden - Access denied',
            404: 'Not Found - API endpoint not found',
            422: 'Unprocessable Entity - Duplicate or invalid relationship',
            500: 'Internal Server Error - osTicket API error',
            501: 'Not Implemented - Subticket plugin not available',
          };

          // Try to parse JSON error response (new format from security fixes)
          let errorData = data;
          try {
            const json = JSON.parse(data);
            if (json.error && json.message) {
              errorData = json.message; // Extract clean message from JSON response
            }
          } catch {
            // Keep raw data if not JSON (backward compatibility with old plain text errors)
          }

          // For 404, prefer specific osTicket message over generic "endpoint not found"
          // osTicket returns: "Ticket not found", "Help Topic not found", "Department not found", etc.
          if (statusCode === 404 && errorData && errorData.trim() !== '') {
            reject(new Error(`osTicket API error: ${errorData}`));
            return;
          }

          const errorMessage = errorMap[statusCode] || `HTTP ${statusCode} - ${errorData}`;
          reject(new Error(`osTicket API error: ${errorMessage}`));
        });
      });

      // Add timeout (10 seconds) to prevent hanging
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout after 10 seconds'));
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      // Send request body
      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Health check - verify API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Use tickets-stats endpoint as health check (minimal load, just COUNT(*))
      // Works with both wildcard API keys and specific API keys with can_read_stats permission
      const url = new URL('/api/tickets-stats.php', this.apiUrl);
      await this.makeRequest('GET', url.toString());
      return true;
    } catch {
      return false;
    }
  }
}
