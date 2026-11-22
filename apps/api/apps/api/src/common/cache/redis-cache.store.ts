import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { Keyv } from 'keyv';
import { createClient } from 'redis';

const logger = new Logger('RedisCache');
let lastLoggedAt = 0;

export function handleRedisCacheError(error: unknown): void {
  const now = Date.now();
  if (now - lastLoggedAt < 10_000) return;
  lastLoggedAt = now;
  const message = error instanceof Error ? error.message : String(error);
  logger.warn(`Redis cache unavailable, reading from the database: ${message}`);
}

export class FailFastRedisStore extends EventEmitter {
  private readonly client: ReturnType<typeof createClient>;

  constructor(url: string) {
    super();
    this.client = createClient({
      url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: (retries: number) => Math.min(retries * 200, 2000),
      },
    });
    this.client.on('error', (error) => this.emit('error', error));
    this.client.connect().catch((error) => this.emit('error', error));
  }

  private async run<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    if (!this.client.isReady) return fallback;
    try {
      return await operation();
    } catch (error) {
      this.emit('error', error);
      return fallback;
    }
  }

  get(key: string): Promise<string | undefined> {
    return this.run(async () => {
      const value = await this.client.get(key);
      return value == null ? undefined : String(value);
    }, undefined);
  }

  set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    return this.run(async () => {
      const serialised =
        typeof value === 'string' ? value : JSON.stringify(value);
      if (ttl) {
        await this.client.set(key, serialised, { PX: ttl });
      } else {
        await this.client.set(key, serialised);
      }
      return true;
    }, false);
  }

  delete(key: string): Promise<boolean> {
    return this.run(async () => Number(await this.client.del(key)) > 0, false);
  }

  has(key: string): Promise<boolean> {
    return this.run(
      async () => Number(await this.client.exists(key)) > 0,
      false,
    );
  }

  async clear(): Promise<void> {}

  async disconnect(): Promise<void> {
    try {
      this.client.destroy();
    } catch {}
  }
}

export function createRedisCacheStore(url: string): Keyv {
  const store = new FailFastRedisStore(url);
  store.on('error', handleRedisCacheError);

  const keyv = new Keyv({ store });
  keyv.on('error', handleRedisCacheError);
  return keyv;
}
