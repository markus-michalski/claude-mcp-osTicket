/**
 * Ticket Entity - Domain Model
 */
export interface Ticket {
  readonly id: number;
  readonly number: string;
  readonly subject: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly department: string;
  readonly created: Date;
  readonly updated: Date;
  readonly dueDate?: Date;
  readonly isOverdue: boolean;
  readonly isAnswered: boolean;
  readonly isClosed: boolean;
  readonly user: TicketUser;
  readonly assignee?: TicketAssignee;
  readonly messages: TicketMessage[];
  readonly replyCount: number;
  readonly lastResponseAt?: Date;
}

export interface TicketUser {
  readonly id: number;
  readonly name: string;
  readonly email: string;
}

export interface TicketAssignee {
  readonly id: number;
  readonly name: string;
}

export interface TicketMessage {
  readonly id: number;
  readonly created: Date;
  readonly author: string;
  readonly type: MessageType;
  readonly title?: string;
  readonly body: string;
  readonly format: MessageFormat;
  readonly isStaffReply: boolean;
}

export enum TicketStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  RESOLVED = 'resolved',
  ARCHIVED = 'archived',
  UNKNOWN = 'unknown'
}

export enum TicketPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  EMERGENCY = 'emergency',
  UNKNOWN = 'unknown'
}

export enum MessageType {
  MESSAGE = 'message',
  RESPONSE = 'response',
  NOTE = 'note'
}

export enum MessageFormat {
  TEXT = 'text',
  HTML = 'html',
  MARKDOWN = 'markdown'
}

/**
 * Ticket List Item - Lightweight representation for list views
 */
export interface TicketListItem {
  readonly id: number;
  readonly number: string;
  readonly subject: string;
  readonly status: TicketStatus;
  readonly created: Date;
  readonly updated: Date;
  readonly isOverdue: boolean;
  readonly userName: string;
  readonly departmentName: string;
  readonly replyCount: number;
  readonly lastResponseAt?: Date;
}

/**
 * Ticket Statistics
 */
export interface TicketStatistics {
  readonly total: number;
  readonly open: number;
  readonly closed: number;
  readonly overdue: number;
  readonly unanswered: number;
  readonly byDepartment: Record<string, DepartmentStats>;
  readonly last7Days: number;
  readonly avgFirstResponseHours: number;
}

export interface DepartmentStats {
  readonly total: number;
  readonly open: number;
}

/**
 * Ticket Filters for list queries
 */
export interface TicketFilters {
  readonly status?: TicketStatus;
  readonly departmentId?: number;
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly limit?: number;
  readonly offset?: number;
}
