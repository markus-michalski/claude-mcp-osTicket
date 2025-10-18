/**
 * Help Topic Entity
 * Represents a help topic/category for ticket classification
 */
export interface HelpTopic {
  /** Unique topic ID */
  readonly id: number;

  /** Topic name/title */
  readonly name: string;

  /** Associated department ID */
  readonly departmentId: number;

  /** Whether this topic is active */
  readonly isActive: boolean;

  /** Optional priority override */
  readonly priorityId?: number;

  /** Whether this topic is publicly visible */
  readonly isPublic: boolean;
}
