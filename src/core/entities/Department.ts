/**
 * Department Entity
 * Represents a department/category in osTicket
 */
export interface Department {
  /** Unique department ID */
  readonly id: number;

  /** Department name */
  readonly name: string;

  /** Parent department ID (null for top-level departments) */
  readonly parentId: number | null;

  /** Full hierarchical path (e.g., "Projekte / OXID 7 / Sitemap") */
  readonly path: string;

  /** Whether this department is publicly visible */
  readonly isPublic: boolean;

  /** Whether this department is active */
  readonly isActive: boolean;
}
