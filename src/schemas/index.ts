/**
 * Zod Schemas for osTicket MCP Server
 *
 * Provides runtime input validation with proper type constraints
 * and descriptive error messages.
 */

import { z } from 'zod';

// Import constants from shared module (avoid duplication)
import { CHARACTER_LIMIT, DEFAULT_LIMIT, MAX_LIMIT } from '../constants.js';

// Re-export for convenience
export { CHARACTER_LIMIT, DEFAULT_LIMIT, MAX_LIMIT };

// ============================================================================
// Enums
// ============================================================================

export enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON = 'json'
}

export enum NoteFormat {
  MARKDOWN = 'markdown',
  HTML = 'html',
  TEXT = 'text'
}

export enum TicketFormat {
  MARKDOWN = 'markdown',
  HTML = 'html',
  TEXT = 'text'
}

// ============================================================================
// Common Schemas
// ============================================================================

export const TicketNumberSchema = z.string()
  .min(1, 'Ticket number is required')
  .max(20, 'Ticket number must not exceed 20 characters')
  .regex(/^\d+$/, 'Ticket number must contain only digits')
  .describe('Public ticket number (e.g., "680284")');

export const TicketIdSchema = z.number()
  .int('Ticket ID must be an integer')
  .positive('Ticket ID must be positive')
  .describe('Internal ticket database ID');

export const PaginationSchema = z.object({
  limit: z.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(MAX_LIMIT, `Limit must not exceed ${MAX_LIMIT}`)
    .default(DEFAULT_LIMIT)
    .describe(`Maximum results to return (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`),
  offset: z.number()
    .int()
    .min(0, 'Offset cannot be negative')
    .default(0)
    .describe('Number of results to skip for pagination (default: 0)')
});

// ============================================================================
// Tool Input Schemas
// ============================================================================

/**
 * osticket_get_ticket - Get a specific ticket with all messages
 */
const GetTicketInputSchemaBase = z.object({
  id: TicketIdSchema.optional(),
  number: TicketNumberSchema.optional()
}).strict();

// Schema with refinement for runtime validation
export const GetTicketInputSchema = GetTicketInputSchemaBase.refine(
  data => data.id !== undefined || data.number !== undefined,
  { message: 'Either id or number parameter is required' }
);

// Shape for MCP SDK registration (without refinement)
export const GetTicketInputSchemaShape = GetTicketInputSchemaBase;

export type GetTicketInput = z.infer<typeof GetTicketInputSchema>;

/**
 * osticket_list_tickets - List tickets with filters
 */
export const TicketStatusEnum = z.enum(['open', 'closed', 'resolved', 'archived']);

export const ListTicketsInputSchema = z.object({
  status: TicketStatusEnum
    .optional()
    .describe('Filter by status (open, closed, resolved, archived)'),
  departmentId: z.number()
    .int()
    .positive()
    .optional()
    .describe('Filter by department ID'),
  limit: PaginationSchema.shape.limit,
  offset: PaginationSchema.shape.offset
}).strict();

export type ListTicketsInput = z.infer<typeof ListTicketsInputSchema>;

/**
 * osticket_search_tickets - Search tickets by subject or number
 */
export const SearchTicketsInputSchema = z.object({
  query: z.string()
    .min(2, 'Query must be at least 2 characters')
    .max(200, 'Query must not exceed 200 characters')
    .describe('Search string to match against ticket subjects and numbers'),
  limit: PaginationSchema.shape.limit
}).strict();

export type SearchTicketsInput = z.infer<typeof SearchTicketsInputSchema>;

/**
 * osticket_get_stats - No input required
 */
export const GetStatsInputSchema = z.object({}).strict();

export type GetStatsInput = z.infer<typeof GetStatsInputSchema>;

/**
 * osticket_create_ticket - Create a new ticket
 */
export const CreateTicketInputSchema = z.object({
  projectContext: z.string()
    .min(1)
    .max(100)
    .optional()
    .describe('Project name/path this ticket relates to. Will be prepended as "**Projekt:** [value]"'),
  name: z.string()
    .min(1)
    .max(100)
    .optional()
    .describe('User name (uses OSTICKET_DEFAULT_NAME if not provided)'),
  email: z.string()
    .email('Invalid email format')
    .optional()
    .describe('User email (uses OSTICKET_DEFAULT_EMAIL if not provided)'),
  subject: z.string()
    .min(1, 'Subject is required')
    .max(255, 'Subject must not exceed 255 characters')
    .describe('Ticket subject/title'),
  message: z.string()
    .min(1, 'Message is required')
    .max(65535, 'Message must not exceed 65535 characters')
    .describe('Ticket message/description (supports Markdown)'),
  format: z.nativeEnum(TicketFormat)
    .default(TicketFormat.MARKDOWN)
    .describe('Message format: markdown (default), html, or text'),
  topicId: z.number()
    .int()
    .positive()
    .optional()
    .describe('Help Topic ID (uses OSTICKET_DEFAULT_TOPIC_ID if not provided)')
}).strict();

export type CreateTicketInput = z.infer<typeof CreateTicketInputSchema>;

/**
 * osticket_update_ticket - Update an existing ticket
 */
const UpdateTicketInputSchemaBase = z.object({
  number: TicketNumberSchema,
  departmentId: z.union([z.string().min(1).max(255), z.number()])
    .optional()
    .describe('Department ID or name'),
  statusId: z.union([z.string().min(1).max(255), z.number()])
    .optional()
    .describe('Status ID or name (e.g., "Open", "Closed")'),
  topicId: z.union([z.string().min(1).max(255), z.number()])
    .optional()
    .describe('Help Topic ID or name'),
  staffId: z.union([z.string().min(1).max(255), z.number()])
    .optional()
    .describe('Staff ID or username to assign ticket'),
  slaId: z.union([z.string().min(1).max(255), z.number()])
    .optional()
    .describe('SLA Plan ID or name'),
  dueDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/, 'Must be ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)')
    .nullable()
    .optional()
    .describe('Due date in ISO 8601 format (e.g., "2025-01-31" or "2025-01-31T17:30:00"). Set to null to clear.'),
  parentTicketNumber: z.string()
    .regex(/^\d+$/, 'Parent ticket number must contain only digits')
    .optional()
    .describe('Parent ticket number (makes this a subticket)'),
  note: z.string()
    .max(65535)
    .optional()
    .describe('Internal note (staff only, not visible to user)'),
  noteTitle: z.string()
    .max(100)
    .optional()
    .describe('Title for internal note (default: "API Update")'),
  noteFormat: z.nativeEnum(NoteFormat)
    .default(NoteFormat.MARKDOWN)
    .describe('Format for note: markdown (default), html, or text')
}).strict();

// Schema with refinement for runtime validation
export const UpdateTicketInputSchema = UpdateTicketInputSchemaBase.refine(
  data => {
    // Exclude 'number' (required) and check if at least one other field is set
    const { number: _number, ...rest } = data;
    return Object.values(rest).some(v => v !== undefined);
  },
  { message: 'At least one field must be provided for update besides ticket number' }
);

// Shape for MCP SDK registration (without refinement)
export const UpdateTicketInputSchemaShape = UpdateTicketInputSchemaBase;

export type UpdateTicketInput = z.infer<typeof UpdateTicketInputSchema>;

/**
 * osticket_delete_ticket - Delete a ticket permanently
 */
export const DeleteTicketInputSchema = z.object({
  number: TicketNumberSchema
}).strict();

export type DeleteTicketInput = z.infer<typeof DeleteTicketInputSchema>;

/**
 * osticket_get_parent_ticket - Get parent of a subticket
 */
export const GetParentTicketInputSchema = z.object({
  number: TicketNumberSchema.describe('Child ticket number')
}).strict();

export type GetParentTicketInput = z.infer<typeof GetParentTicketInputSchema>;

/**
 * osticket_get_child_tickets - Get subtickets of a parent
 */
export const GetChildTicketsInputSchema = z.object({
  number: TicketNumberSchema.describe('Parent ticket number')
}).strict();

export type GetChildTicketsInput = z.infer<typeof GetChildTicketsInputSchema>;

/**
 * osticket_create_subticket_link - Link two tickets
 */
export const CreateSubticketLinkInputSchema = z.object({
  parentNumber: TicketNumberSchema.describe('Parent ticket number'),
  childNumber: TicketNumberSchema.describe('Child ticket number')
}).strict();

export type CreateSubticketLinkInput = z.infer<typeof CreateSubticketLinkInputSchema>;

/**
 * osticket_unlink_subticket - Remove parent-child relationship
 */
export const UnlinkSubticketInputSchema = z.object({
  number: TicketNumberSchema.describe('Child ticket number to unlink')
}).strict();

export type UnlinkSubticketInput = z.infer<typeof UnlinkSubticketInputSchema>;
