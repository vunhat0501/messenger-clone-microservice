import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { env } from 'apps/api/src/config/env.config';

export const PRESENCE_HEARTBEAT_MS = 10_000;
export const PRESENCE_SWEEP_MS = 15_000;
export const PRESENCE_STALE_MS = 30_000;

export interface PresenceEntry {
  userId: string;
  socketId: string;
}

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private readonly logger = new Logger(PresenceService.name);
  private lastErrorLoggedAt = 0;

  private readonly ONLINE_SET_KEY = 'presence:online_users';
  private readonly USER_SOCKETS_PREFIX = 'presence:sockets:';

  async onModuleInit() {
    this.client = createClient({
      url: env.REDIS_URL,
      disableOfflineQueue: true,
    });
    this.client.on('error', (err) => this.logError(err));
    try {
      await this.client.connect();
    } catch (err) {
      this.logError(err);
    }
  }

  async onModuleDestroy() {
    if (this.client && this.client.isOpen) {
      await this.client.quit();
    }
  }

  logError(err: unknown): void {
    const now = Date.now();
    if (now - this.lastErrorLoggedAt < 10_000) return;
    this.lastErrorLoggedAt = now;
    const message = err instanceof Error ? err.message : String(err);
    this.logger.warn(
      `Presence unavailable, online status may be stale: ${message}`,
    );
  }

  private socketsKey(userId: string): string {
    return `${this.USER_SOCKETS_PREFIX}${userId}`;
  }

  /**
   */
  async addConnection(userId: string, socketId: string): Promise<boolean> {
    const now = Date.now();
    const key = this.socketsKey(userId);
    await this.client.zAdd(key, { score: now, value: socketId });
    await this.client.zRemRangeByScore(key, '-inf', now - PRESENCE_STALE_MS);
    const added = await this.client.sAdd(this.ONLINE_SET_KEY, userId);
    return Number(added) === 1;
  }

  /**
   */
  async removeConnection(userId: string, socketId: string): Promise<boolean> {
    const key = this.socketsKey(userId);
    await this.client.zRem(key, socketId);
    return this.markOfflineIfNoSockets(userId);
  }

  async heartbeat(entries: PresenceEntry[]): Promise<string[]> {
    const now = Date.now();
    const cameOnline: string[] = [];
    for (const { userId, socketId } of entries) {
      await this.client.zAdd(this.socketsKey(userId), {
        score: now,
        value: socketId,
      });
      const added = await this.client.sAdd(this.ONLINE_SET_KEY, userId);
      if (Number(added) === 1) cameOnline.push(userId);
    }
    return cameOnline;
  }

  async sweepStale(): Promise<string[]> {
    const users = await this.client.sMembers(this.ONLINE_SET_KEY);
    const wentOffline: string[] = [];
    for (const userId of users) {
      await this.client.zRemRangeByScore(
        this.socketsKey(userId),
        '-inf',
        Date.now() - PRESENCE_STALE_MS,
      );
      if (await this.markOfflineIfNoSockets(userId)) wentOffline.push(userId);
    }
    return wentOffline;
  }

  private async markOfflineIfNoSockets(userId: string): Promise<boolean> {
    const remaining = await this.client.zCard(this.socketsKey(userId));
    if (Number(remaining) > 0) return false;
    const removed = await this.client.sRem(this.ONLINE_SET_KEY, userId);
    return Number(removed) === 1;
  }

  async getOnlineUsers(): Promise<string[]> {
    return this.client.sMembers(this.ONLINE_SET_KEY);
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const result = await this.client.sIsMember(this.ONLINE_SET_KEY, userId);
    return Boolean(result);
  }
}
