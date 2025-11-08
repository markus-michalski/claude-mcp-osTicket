/**
 * TypeScript Type Definitions for Subticket API
 *
 * These types define the structure of requests and responses
 * for the osTicket Subticket Management API endpoints.
 */

/**
 * Ticket data structure returned by subticket API endpoints
 */
export interface SubticketData {
  /** Internal ticket ID (database primary key) */
  ticket_id: number;

  /** Public ticket number (e.g., "680284") */
  number: string;

  /** Ticket subject/title */
  subject: string;

  /** Current ticket status (e.g., "Open", "Closed") */
  status: string;
}

/**
 * Response from GET /api/tickets-subtickets-parent.php/:childNumber.json
 *
 * Returns the parent ticket of a subticket, or null if no parent exists
 */
export interface GetParentResponse {
  /** Parent ticket data, or null if ticket has no parent */
  parent: SubticketData | null;
}

/**
 * Response from GET /api/tickets-subtickets-list.php/:parentNumber.json
 *
 * Returns an array of child tickets (subtickets)
 */
export interface GetChildrenResponse {
  /** Array of child tickets, empty array if no children */
  children: SubticketData[];
}

/**
 * Response from POST /api/tickets-subtickets-create.php/:parentNumber.json
 *
 * Returns success confirmation with parent and child ticket data
 */
export interface CreateLinkResponse {
  /** Success status */
  success: boolean;

  /** Success message */
  message: string;

  /** Parent ticket data */
  parent: SubticketData;

  /** Child ticket data */
  child: SubticketData;
}

/**
 * Response from DELETE /api/tickets-subtickets-unlink.php/:childNumber.json
 *
 * Returns success confirmation with child ticket data
 */
export interface UnlinkResponse {
  /** Success status */
  success: boolean;

  /** Success message */
  message: string;

  /** Child ticket data */
  child: SubticketData;
}
