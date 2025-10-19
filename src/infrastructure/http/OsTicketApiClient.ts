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
   */
  async createTicket(params: {
    name: string;
    email: string;
    subject: string;
    message: string;
    topicId?: number;
    departmentId?: number;
    alert?: boolean;
    autorespond?: boolean;
  }): Promise<string> {
    const url = new URL('/api/http.php/tickets.json', this.apiUrl);

    const body = {
      name: params.name,
      email: params.email,
      subject: params.subject,
      message: params.message,
      topicId: params.topicId || 1,
      alert: params.alert ?? false,
      autorespond: params.autorespond ?? false,
    };

    // Add departmentId only if provided (API doesn't require it)
    if (params.departmentId) {
      (body as any).departmentId = params.departmentId;
    }

    const response = await this.makeRequest('POST', url.toString(), body);

    // Debug: Log response type and value
    console.log('[API] CREATE response type:', typeof response);
    console.log('[API] CREATE response value:', response);

    // osTicket API returns ticket number as plain text response
    if (typeof response === 'string') {
      const ticketNumber = response.trim();
      console.log('[API] Extracted ticket number:', ticketNumber);
      return ticketNumber;
    }

    // Fallback: try to extract from JSON response
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
      // osTicket API doesn't have a dedicated health endpoint
      // We just check if the base URL is reachable
      const url = new URL('/api/http.php', this.apiUrl);
      await this.makeRequest('GET', url.toString());
      return true;
    } catch {
      return false;
    }
  }
}
