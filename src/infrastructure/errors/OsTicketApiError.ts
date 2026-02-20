/**
 * Custom error class for osTicket API errors.
 * Carries the HTTP status code to enable structured error handling
 * instead of fragile string matching.
 */
export class OsTicketApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'OsTicketApiError';
    this.statusCode = statusCode;
  }
}
