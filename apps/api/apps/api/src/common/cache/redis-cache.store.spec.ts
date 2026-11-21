import { createRedisCacheStore } from './redis-cache.store';

describe('createRedisCacheStore', () => {
  it('turns an unreachable Redis into immediate cache misses instead of waiting', async () => {
    const keyv = createRedisCacheStore('redis://127.0.0.1:6390');
    const startedAt = Date.now();

    await expect(keyv.get('some-key')).resolves.toBeUndefined();
    await expect(keyv.set('some-key', 'value')).resolves.toBeDefined();
    await expect(keyv.delete('some-key')).resolves.toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(500);

    await keyv.disconnect();
  });
});
