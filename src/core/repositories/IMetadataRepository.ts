import { Department } from '../entities/Department.js';
import { HelpTopic } from '../entities/HelpTopic.js';

/**
 * Metadata Repository Interface
 * Defines contract for querying departments and help topics
 */
export interface IMetadataRepository {
  /**
   * Query all departments with hierarchical information
   * @returns List of all departments with their paths
   */
  queryDepartments(): Promise<Department[]>;

  /**
   * Query all help topics
   * @returns List of all help topics
   */
  queryHelpTopics(): Promise<HelpTopic[]>;
}
