import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { RedisCacheModule } from './redis-cache.module';

jest.mock('apps/api/src/config/env.config', () => ({
  env: { REDIS_URL: 'redis://127.0.0.1:6390' },
}));

describe('RedisCacheModule', () => {
  it('misses the cache instead of crashing when Redis is unreachable', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RedisCacheModule],
    }).compile();
    await moduleRef.init();
    const cache = moduleRef.get<Cache>(CACHE_MANAGER);
    const startedAt = Date.now();

    await expect(cache.get('some-key')).resolves.toBeFalsy();
    await cache.set('some-key', 'value');
    await cache.del('some-key');
    expect(Date.now() - startedAt).toBeLessThan(5000);

    try {
      await moduleRef.close();
    } catch {}
  });
});
