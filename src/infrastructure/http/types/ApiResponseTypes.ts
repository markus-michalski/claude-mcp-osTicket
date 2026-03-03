/**
 * TypeScript Type Definitions for osTicket API Responses
 *
 * These types describe the known response structures from osTicket REST API.
 * Fields marked optional may not be present depending on API version/config.
 */

/** Attachment metadata returned with thread entries */
export interface AttachmentMetadata {
  id: number;
  file_id: number;
  filename: string;
  size: number;
  mime_type: string;
  inline: boolean;
}

/** Ticket thread entry (message or note) */
export interface TicketThreadEntry {
  id: number;
  type: string;
  poster: string;
  body: string;
  created: string;
  updated?: string;
  attachments?: AttachmentMetadata[];
  attachment_count?: number;
}

/** Attachment download response from GET /api/tickets-attachment-download.php/:file_id.json */
export interface AttachmentDownloadResponse {
  file_id: number;
  filename: string;
  mime_type: string;
  size: number;
  content: string; // base64-encoded
}

/** Ticket detail response from GET /api/tickets-get.php/:number.json */
export interface TicketDetailResponse {
  ticket_id: number;
  number: string;
  subject: string;
  status: {
    id: number;
    name: string;
    state: string;
  };
  department: {
    id: number;
    name: string;
  };
  priority?: {
    id: number;
    desc: string;
  };
  user: {
    name: string;
    email: string;
  };
  assignee?: {
    id: number;
    name: string;
  };
  created: string;
  updated: string;
  due_date?: string | null;
  thread?: TicketThreadEntry[];
}

/** Ticket summary in list/search results */
export interface TicketSummary {
  ticket_id: number;
  number: string;
  subject: string;
  status: string;
  department?: string;
  created: string;
  updated?: string;
}

/** Ticket statistics response */
export interface TicketStatsResponse {
  total?: number;
  open?: number;
  closed?: number;
  resolved?: number;
  overdue?: number;
  [key: string]: unknown;
}

/** Update ticket response */
export interface UpdateTicketResponse {
  success?: boolean;
  message?: string;
  [key: string]: unknown;
}

/** Delete ticket response */
export interface DeleteTicketResponse {
  success?: boolean;
  message?: string;
}
