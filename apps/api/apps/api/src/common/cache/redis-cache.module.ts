import { Global, Inject, Module, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { env } from 'apps/api/src/config/env.config';
import { CACHE_KEYS, CACHE_TTL } from './cache.constants';
import {
  createRedisCacheStore,
  handleRedisCacheError,
} from './redis-cache.store';

export { CACHE_KEYS, CACHE_TTL };

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [createRedisCacheStore(env.REDIS_URL)],
        ttl: CACHE_TTL.USERS_ALL,
      }),
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule implements OnModuleInit {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  onModuleInit() {
    for (const store of this.cacheManager.stores) {
      store.on('error', handleRedisCacheError);
    }
  }
}
