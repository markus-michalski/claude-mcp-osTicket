import { ITicketRepository } from '../../core/repositories/ITicketRepository.js';
import {
  Ticket,
  TicketListItem,
  TicketStatistics,
  TicketFilters,
  TicketStatus,
  TicketPriority,
  MessageType,
  MessageFormat,
  DepartmentStats
} from '../../core/entities/Ticket.js';
import { DatabaseConnectionManager } from './DatabaseConnectionManager.js';

/**
 * MySQL Implementation of Ticket Repository
 * Uses optimized queries to avoid N+1 problems
 */
export class MySQLTicketRepository implements ITicketRepository {
  constructor(
    private readonly db: DatabaseConnectionManager,
    private readonly tablePrefix: string = 'ost_'
  ) {}

  /**
   * Find ticket by ID with all messages (optimized with 2 queries max)
   */
  async findById(id: number): Promise<Ticket | null> {
    // Query 1: Ticket main data
    const ticketSql = `
      SELECT
        t.ticket_id,
        t.number,
        cd.subject,
        t.created,
        t.updated as lastupdate,
        t.duedate,
        t.isoverdue,
        t.isanswered,
        t.closed,
        ts.name as status_name,
        ts.state as status_state,
        u.id as user_id,
        u.name as user_name,
        ue.address as user_email,
        d.name as department_name,
        s.staff_id,
        CONCAT(s.firstname, ' ', s.lastname) as staff_name
      FROM ${this.tablePrefix}ticket t
      LEFT JOIN ${this.tablePrefix}ticket__cdata cd ON t.ticket_id = cd.ticket_id
      LEFT JOIN ${this.tablePrefix}ticket_status ts ON t.status_id = ts.id
      LEFT JOIN ${this.tablePrefix}user u ON t.user_id = u.id
      LEFT JOIN ${this.tablePrefix}user_email ue ON u.default_email_id = ue.id
      LEFT JOIN ${this.tablePrefix}department d ON t.dept_id = d.id
      LEFT JOIN ${this.tablePrefix}staff s ON t.staff_id = s.staff_id
      WHERE t.ticket_id = ?
    `;

    const ticketRow = await this.db.queryOne<any>(ticketSql, [id]);
    if (!ticketRow) return null;

    // Query 2: All messages for this ticket
    const messagesSql = `
      SELECT
        te.id,
        te.created,
        te.poster,
        te.type,
        te.title,
        te.body,
        te.format,
        te.staff_id,
        te.user_id,
        CONCAT(s.firstname, ' ', s.lastname) as staff_name,
        u.name as user_name
      FROM ${this.tablePrefix}thread_entry te
      INNER JOIN ${this.tablePrefix}thread th ON te.thread_id = th.id
      LEFT JOIN ${this.tablePrefix}staff s ON te.staff_id = s.staff_id
      LEFT JOIN ${this.tablePrefix}user u ON te.user_id = u.id
      WHERE th.object_id = ? AND th.object_type = 'T'
      ORDER BY te.created ASC
    `;

    const messagesRows = await this.db.query<any>(messagesSql, [id]);

    return this.mapTicket(ticketRow, messagesRows);
  }

  /**
   * Find ticket by number
   */
  async findByNumber(ticketNumber: string): Promise<Ticket | null> {
    // First get ticket ID
    const sql = `SELECT ticket_id FROM ${this.tablePrefix}ticket WHERE number = ?`;
    const row = await this.db.queryOne<any>(sql, [ticketNumber]);

    if (!row) return null;

    return this.findById(row.ticket_id);
  }

  /**
   * List tickets with filters
   */
  async list(filters?: TicketFilters): Promise<TicketListItem[]> {
    const params: any[] = [];
    let sql = `
      SELECT
        t.ticket_id,
        t.number,
        cd.subject,
        t.created,
        t.updated,
        t.isoverdue,
        ts.name as status_name,
        ts.state as status_state,
        u.name as user_name,
        d.name as department_name,
        (SELECT COUNT(*)
         FROM ${this.tablePrefix}thread_entry te
         INNER JOIN ${this.tablePrefix}thread th ON te.thread_id = th.id
         WHERE th.object_id = t.ticket_id
         AND th.object_type = 'T') as reply_count,
        (SELECT MAX(te.created)
         FROM ${this.tablePrefix}thread_entry te
         INNER JOIN ${this.tablePrefix}thread th ON te.thread_id = th.id
         WHERE th.object_id = t.ticket_id
         AND th.object_type = 'T') as last_response
      FROM ${this.tablePrefix}ticket t
      LEFT JOIN ${this.tablePrefix}ticket__cdata cd ON t.ticket_id = cd.ticket_id
      LEFT JOIN ${this.tablePrefix}ticket_status ts ON t.status_id = ts.id
      LEFT JOIN ${this.tablePrefix}user u ON t.user_id = u.id
      LEFT JOIN ${this.tablePrefix}department d ON t.dept_id = d.id
      WHERE 1=1
    `;

    // Apply filters
    if (filters?.status) {
      sql += ' AND ts.state = ?';
      params.push(filters.status);
    }

    if (filters?.departmentId) {
      sql += ' AND t.dept_id = ?';
      params.push(filters.departmentId);
    }

    if (filters?.dateFrom) {
      sql += ' AND t.created >= ?';
      params.push(filters.dateFrom);
    }

    if (filters?.dateTo) {
      sql += ' AND t.created <= ?';
      params.push(filters.dateTo);
    }

    sql += ' ORDER BY t.created DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);

      if (filters?.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const rows = await this.db.query<any>(sql, params);
    return rows.map(row => this.mapTicketListItem(row));
  }

  /**
   * Search tickets by query
   */
  async search(query: string, limit: number = 20): Promise<TicketListItem[]> {
    const sql = `
      SELECT
        t.ticket_id,
        t.number,
        cd.subject,
        t.created,
        t.updated,
        t.isoverdue,
        ts.name as status_name,
        ts.state as status_state,
        u.name as user_name,
        d.name as department_name,
        0 as reply_count,
        NULL as last_response
      FROM ${this.tablePrefix}ticket t
      LEFT JOIN ${this.tablePrefix}ticket__cdata cd ON t.ticket_id = cd.ticket_id
      LEFT JOIN ${this.tablePrefix}ticket_status ts ON t.status_id = ts.id
      LEFT JOIN ${this.tablePrefix}user u ON t.user_id = u.id
      LEFT JOIN ${this.tablePrefix}department d ON t.dept_id = d.id
      WHERE
        t.number LIKE ?
        OR cd.subject LIKE ?
      ORDER BY
        CASE
          WHEN t.number = ? THEN 1
          ELSE 2
        END,
        t.created DESC
      LIMIT ?
    `;

    const searchPattern = `%${query}%`;
    const rows = await this.db.query<any>(sql, [searchPattern, searchPattern, query, limit]);

    return rows.map(row => this.mapTicketListItem(row));
  }

  /**
   * Get aggregated statistics
   */
  async getStatistics(): Promise<TicketStatistics> {
    const sql = `
      SELECT
        COUNT(*) as total_tickets,
        SUM(CASE WHEN ts.state = 'open' THEN 1 ELSE 0 END) as open_tickets,
        SUM(CASE WHEN ts.state = 'closed' THEN 1 ELSE 0 END) as closed_tickets,
        SUM(CASE WHEN t.isoverdue = 1 THEN 1 ELSE 0 END) as overdue_tickets,
        SUM(CASE WHEN t.isanswered = 0 AND ts.state = 'open' THEN 1 ELSE 0 END) as unanswered_tickets,
        SUM(CASE WHEN t.created >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as last_7_days,
        AVG(TIMESTAMPDIFF(HOUR, t.created,
          COALESCE(
            (SELECT MIN(te.created)
             FROM ${this.tablePrefix}thread_entry te
             INNER JOIN ${this.tablePrefix}thread th ON te.thread_id = th.id
             WHERE th.object_id = t.ticket_id
             AND th.object_type = 'T'
             AND te.staff_id IS NOT NULL),
            NOW()
          )
        )) as avg_first_response_hours
      FROM ${this.tablePrefix}ticket t
      LEFT JOIN ${this.tablePrefix}ticket_status ts ON t.status_id = ts.id
    `;

    const statsRow = await this.db.queryOne<any>(sql);

    // Get department statistics
    const deptSql = `
      SELECT
        IFNULL(d.name, 'Unassigned') as dept_name,
        COUNT(t.ticket_id) as total,
        SUM(CASE WHEN ts.state = 'open' THEN 1 ELSE 0 END) as open_count
      FROM ${this.tablePrefix}ticket t
      LEFT JOIN ${this.tablePrefix}department d ON t.dept_id = d.id
      LEFT JOIN ${this.tablePrefix}ticket_status ts ON t.status_id = ts.id
      GROUP BY d.name
    `;

    const deptRows = await this.db.query<any>(deptSql);

    const byDepartment: Record<string, DepartmentStats> = {};
    deptRows.forEach(row => {
      byDepartment[row.dept_name] = {
        total: row.total,
        open: row.open_count
      };
    });

    return {
      total: statsRow?.total_tickets || 0,
      open: statsRow?.open_tickets || 0,
      closed: statsRow?.closed_tickets || 0,
      overdue: statsRow?.overdue_tickets || 0,
      unanswered: statsRow?.unanswered_tickets || 0,
      byDepartment,
      last7Days: statsRow?.last_7_days || 0,
      avgFirstResponseHours: parseFloat(statsRow?.avg_first_response_hours || '0')
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return await this.db.healthCheck();
  }

  /**
   * Map database row to Ticket entity
   */
  private mapTicket(ticketRow: any, messagesRows: any[]): Ticket {
    return {
      id: ticketRow.ticket_id,
      number: ticketRow.number,
      subject: ticketRow.subject,
      status: this.mapStatus(ticketRow.status_state),
      priority: TicketPriority.NORMAL, // osTicket priority mapping would go here
      department: ticketRow.department_name || 'Unknown',
      created: new Date(ticketRow.created),
      updated: new Date(ticketRow.lastupdate),
      dueDate: ticketRow.duedate ? new Date(ticketRow.duedate) : undefined,
      isOverdue: Boolean(ticketRow.isoverdue),
      isAnswered: Boolean(ticketRow.isanswered),
      isClosed: Boolean(ticketRow.closed),
      user: {
        id: ticketRow.user_id,
        name: ticketRow.user_name,
        email: ticketRow.user_email
      },
      assignee: ticketRow.staff_id ? {
        id: ticketRow.staff_id,
        name: ticketRow.staff_name
      } : undefined,
      messages: messagesRows.map(msg => this.mapMessage(msg)),
      replyCount: messagesRows.length,
      lastResponseAt: messagesRows.length > 0
        ? new Date(messagesRows[messagesRows.length - 1].created)
        : undefined
    };
  }

  /**
   * Map database row to TicketListItem
   */
  private mapTicketListItem(row: any): TicketListItem {
    return {
      id: row.ticket_id,
      number: row.number,
      subject: row.subject,
      status: this.mapStatus(row.status_state),
      created: new Date(row.created),
      updated: new Date(row.updated),
      isOverdue: Boolean(row.isoverdue),
      userName: row.user_name,
      departmentName: row.department_name || 'Unknown',
      replyCount: row.reply_count || 0,
      lastResponseAt: row.last_response ? new Date(row.last_response) : undefined
    };
  }

  /**
   * Map database row to TicketMessage
   */
  private mapMessage(row: any): any {
    return {
      id: row.id,
      created: new Date(row.created),
      author: row.staff_name || row.user_name || row.poster,
      type: this.mapMessageType(row.type),
      title: row.title,
      body: row.body,
      format: this.mapMessageFormat(row.format),
      isStaffReply: Boolean(row.staff_id)
    };
  }

  private mapStatus(state: string): TicketStatus {
    switch (state?.toLowerCase()) {
      case 'open': return TicketStatus.OPEN;
      case 'closed': return TicketStatus.CLOSED;
      case 'resolved': return TicketStatus.RESOLVED;
      case 'archived': return TicketStatus.ARCHIVED;
      default: return TicketStatus.UNKNOWN;
    }
  }

  private mapMessageType(type: string): MessageType {
    switch (type?.toLowerCase()) {
      case 'message': return MessageType.MESSAGE;
      case 'response': return MessageType.RESPONSE;
      case 'note': return MessageType.NOTE;
      default: return MessageType.MESSAGE;
    }
  }

  private mapMessageFormat(format: string): MessageFormat {
    switch (format?.toLowerCase()) {
      case 'html': return MessageFormat.HTML;
      case 'markdown': return MessageFormat.MARKDOWN;
      default: return MessageFormat.TEXT;
    }
  }
}
