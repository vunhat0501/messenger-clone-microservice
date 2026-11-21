import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from 'apps/api/src/config/env.config';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);
  private lastErrorLoggedAt = 0;

  private readonly onRedisError = (err: Error) => {
    const now = Date.now();
    if (now - this.lastErrorLoggedAt < 10_000) return;
    this.lastErrorLoggedAt = now;
    this.logger.warn(
      `Redis pub/sub unavailable, cross-gateway events paused: ${err.message}`,
    );
  };

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({
      url: env.REDIS_URL,
      disableOfflineQueue: true,
    });
    const subClient = pubClient.duplicate();

    pubClient.on('error', this.onRedisError);
    subClient.on('error', this.onRedisError);

    const publish = pubClient.publish.bind(pubClient);
    Object.defineProperty(pubClient, 'publish', {
      configurable: true,
      writable: true,
      value: (...args: Parameters<typeof publish>) =>
        publish(...args).catch((err: Error) => {
          this.onRedisError(err);
          return 0;
        }),
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
