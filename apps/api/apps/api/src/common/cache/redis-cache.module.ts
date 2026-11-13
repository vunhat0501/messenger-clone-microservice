import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { env } from 'apps/api/src/config/env.config';
import { CACHE_KEYS, CACHE_TTL } from './cache.constants';

export { CACHE_KEYS, CACHE_TTL };

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        stores: [
          new Keyv({
            store: new KeyvRedis(env.REDIS_URL),
          }),
        ],
        ttl: CACHE_TTL.USERS_ALL,
      }),
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule {}
