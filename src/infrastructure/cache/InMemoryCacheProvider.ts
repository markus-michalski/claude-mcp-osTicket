import { ICacheProvider, CacheStats } from '../../core/repositories/ICacheProvider.js';

interface CacheEntry<T> {
  data: T;
  expires: number;
  lastAccess: number;
}

/**
 * In-Memory Cache Provider with LRU Eviction
 * Simple, fast, no external dependencies
 */
export class InMemoryCacheProvider implements ICacheProvider {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private hits = 0;
  private misses = 0;
  private evictionTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly maxSize: number = 1000,
    private readonly defaultTTL: number = 300000 // 5 minutes
  ) {
    // Start periodic cleanup
    this.startEvictionTimer();
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check expiration
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update last access time (LRU)
    entry.lastAccess = Date.now();
    this.hits++;

    return entry.data as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expiry = ttl || this.defaultTTL;

    // LRU eviction if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, {
      data: value,
      expires: Date.now() + expiry,
      lastAccess: Date.now()
    });
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // Convert glob pattern to regex
    const regex = this.patternToRegex(pattern);

    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  async getStats(): Promise<CacheStats> {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    this.cache.clear();
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private startEvictionTimer(): void {
    // Cleanup expired entries every minute
    this.evictionTimer = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  private patternToRegex(pattern: string): RegExp {
    // Convert glob pattern to regex
    // ticket:* -> ^ticket:.*$
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  }
}
