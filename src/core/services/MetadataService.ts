import { Department } from '../entities/Department.js';
import { HelpTopic } from '../entities/HelpTopic.js';
import { IMetadataRepository } from '../repositories/IMetadataRepository.js';

/**
 * Metadata Service
 * Provides intelligent lookup and fuzzy matching for Departments and Help Topics
 */
export class MetadataService {
  private departmentsCache: Department[] | null = null;
  private topicsCache: HelpTopic[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly repository: IMetadataRepository) {}

  /**
   * Get all departments with hierarchical structure
   * Results are cached for 5 minutes
   */
  async getDepartments(): Promise<Department[]> {
    if (this.isCacheValid() && this.departmentsCache) {
      return this.departmentsCache;
    }

    const departments = await this.repository.queryDepartments();
    this.departmentsCache = departments;
    this.cacheTimestamp = Date.now();

    return departments;
  }

  /**
   * Get all help topics
   * Results are cached for 5 minutes
   */
  async getHelpTopics(): Promise<HelpTopic[]> {
    if (this.isCacheValid() && this.topicsCache) {
      return this.topicsCache;
    }

    const topics = await this.repository.queryHelpTopics();
    this.topicsCache = topics;
    this.cacheTimestamp = Date.now();

    return topics;
  }

  /**
   * Find department by name using fuzzy matching
   *
   * Matching strategies (in order of priority):
   * 1. Exact match (case-insensitive)
   * 2. Full path match (e.g., "Projekte / OXID 7 / Sitemap")
   * 3. Partial path match (e.g., "OXID Sitemap")
   * 4. Name contains search term
   *
   * @param name - Department name or path to search for
   * @returns Matching department or null if not found
   * @throws Error with available departments list if no match found
   */
  async findDepartmentByName(name: string): Promise<Department | null> {
    const departments = await this.getDepartments();
    const normalizedSearch = this.normalizeString(name);

    // Strategy 1: Exact name match (case-insensitive)
    const exactMatch = departments.find(
      dept => this.normalizeString(dept.name) === normalizedSearch
    );
    if (exactMatch) return exactMatch;

    // Strategy 2: Exact path match (case-insensitive)
    const pathMatch = departments.find(
      dept => this.normalizeString(dept.path) === normalizedSearch
    );
    if (pathMatch) return pathMatch;

    // Strategy 3: Path contains search term (for partial paths like "OXID Sitemap")
    const partialPathMatch = departments.find(dept =>
      this.normalizeString(dept.path).includes(normalizedSearch)
    );
    if (partialPathMatch) return partialPathMatch;

    // Strategy 4: Name contains search term (most lenient)
    const partialNameMatch = departments.find(dept =>
      this.normalizeString(dept.name).includes(normalizedSearch)
    );
    if (partialNameMatch) return partialNameMatch;

    // No match found - throw error with helpful message
    throw new Error(this.buildDepartmentNotFoundError(name, departments));
  }

  /**
   * Find help topic by name using fuzzy matching
   *
   * Matching strategies (in order):
   * 1. Exact match (case-insensitive)
   * 2. Name contains search term
   * 3. Common aliases (Bug → Softwarebug, Feature → Feature Request, etc.)
   *
   * @param name - Topic name to search for
   * @returns Matching topic or null if not found
   * @throws Error with available topics list if no match found
   */
  async findTopicByName(name: string): Promise<HelpTopic | null> {
    const topics = await this.getHelpTopics();
    const normalizedSearch = this.normalizeString(name);

    // Strategy 1: Exact match (case-insensitive)
    const exactMatch = topics.find(
      topic => this.normalizeString(topic.name) === normalizedSearch
    );
    if (exactMatch) return exactMatch;

    // Strategy 2: Name contains search term
    const partialMatch = topics.find(topic =>
      this.normalizeString(topic.name).includes(normalizedSearch)
    );
    if (partialMatch) return partialMatch;

    // Strategy 3: Common aliases
    const aliasMatch = this.findTopicByAlias(normalizedSearch, topics);
    if (aliasMatch) return aliasMatch;

    // No match found - throw error with helpful message
    throw new Error(this.buildTopicNotFoundError(name, topics));
  }

  /**
   * Clear the cache (useful for testing or after metadata changes)
   */
  clearCache(): void {
    this.departmentsCache = null;
    this.topicsCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.cacheTTL;
  }

  /**
   * Normalize string for comparison (lowercase, trim, normalize whitespace)
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s*\/\s*/g, ' / '); // Normalize path separators
  }

  /**
   * Find topic by common aliases
   */
  private findTopicByAlias(normalizedSearch: string, topics: HelpTopic[]): HelpTopic | null {
    const aliases: Record<string, string[]> = {
      // Bug-related aliases
      'bug': ['softwarebug', 'defect', 'issue', 'error'],
      'softwarebug': ['bug', 'defect', 'issue'],

      // Feature-related aliases
      'feature': ['feature request', 'enhancement', 'new feature'],
      'feature request': ['feature', 'enhancement'],
      'enhancement': ['feature', 'feature request', 'improvement'],

      // Support-related aliases
      'support': ['help', 'question', 'assistance'],
      'question': ['support', 'help', 'inquiry'],

      // General inquiry
      'general': ['general inquiry', 'other', 'misc'],
      'general inquiry': ['general', 'other'],
    };

    // Check if search term has aliases
    const aliasKeys = aliases[normalizedSearch] || [];

    for (const alias of aliasKeys) {
      const match = topics.find(topic =>
        this.normalizeString(topic.name).includes(alias)
      );
      if (match) return match;
    }

    return null;
  }

  /**
   * Build helpful error message for department not found
   */
  private buildDepartmentNotFoundError(searchName: string, departments: Department[]): string {
    const activeDepts = departments.filter(d => d.isActive);

    const deptList = activeDepts
      .map(d => `  - ID ${d.id}: "${d.path}"`)
      .join('\n');

    return `Department not found: "${searchName}"\n\nAvailable departments:\n${deptList}\n\nPlease use either the department ID or one of the names/paths above.`;
  }

  /**
   * Build helpful error message for topic not found
   */
  private buildTopicNotFoundError(searchName: string, topics: HelpTopic[]): string {
    const activeTopics = topics.filter(t => t.isActive);

    const topicList = activeTopics
      .map(t => `  - ID ${t.id}: "${t.name}"`)
      .join('\n');

    return `Help topic not found: "${searchName}"\n\nAvailable topics:\n${topicList}\n\nPlease use either the topic ID or one of the names above.`;
  }
}
