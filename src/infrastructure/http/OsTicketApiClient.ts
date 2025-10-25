import https from 'https';
import http from 'http';

/**
 * osTicket API Client
 * Handles HTTP communication with osTicket REST API
 */
export class OsTicketApiClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly rejectUnauthorized: boolean;

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
   * Update ticket
   * PATCH /api/tickets-update.php/:number.json
   */
  async updateTicket(number: string, updates: {
    departmentId?: string | number;
    statusId?: string | number;
    priorityId?: string | number;
    topicId?: string | number;
    staffId?: string | number;
    slaId?: string | number;
    parentTicketNumber?: string;
    note?: string;
    noteTitle?: string;
    noteFormat?: string;
  }): Promise<any> {
    const url = new URL(`/api/tickets-update.php/${number}.json`, this.apiUrl);
    return await this.makeRequest('PATCH', url.toString(), updates);
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

      const options = {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: this.rejectUnauthorized,
      };

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
            500: 'Internal Server Error - osTicket API error',
          };

          const errorMessage = errorMap[statusCode] || `HTTP ${statusCode} - ${data}`;
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
