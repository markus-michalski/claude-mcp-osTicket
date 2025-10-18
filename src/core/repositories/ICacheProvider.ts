/**
 * Cache Provider Interface
 * Allows swapping between in-memory, Redis, etc.
 */
export interface ICacheProvider {
  /**
   * Get a value from cache
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in cache with TTL
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Check if key exists in cache
   */
  has(key: string): Promise<boolean>;

  /**
   * Delete a specific key
   */
  delete(key: string): Promise<void>;

  /**
   * Invalidate cache entries matching a pattern
   * Example: "ticket:*" deletes all ticket cache entries
   */
  invalidatePattern(pattern: string): Promise<void>;

  /**
   * Clear all cache entries
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly size: number;
  readonly maxSize: number;
}
