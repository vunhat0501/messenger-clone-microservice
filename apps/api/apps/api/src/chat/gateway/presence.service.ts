import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { env } from 'apps/api/src/config/env.config';

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  private readonly ONLINE_SET_KEY = 'presence:online_users';
  private readonly USER_SOCKETS_PREFIX = 'presence:user_sockets:';

  async onModuleInit() {
    this.client = createClient({ url: env.REDIS_URL });
    this.client.on('error', (err) => {
      console.error('PresenceService Redis Client Error:', err);
    });
    await this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client && this.client.isOpen) {
      await this.client.quit();
    }
  }

  /**
   * * Registers a connected socket for a user.
   * * Returns true if this is the user's first active connection (offline -> online transition).
   */
  async addConnection(userId: string, socketId: string): Promise<boolean> {
    const socketSetKey = `${this.USER_SOCKETS_PREFIX}${userId}`;
    const added = await this.client.sAdd(socketSetKey, socketId);
    await this.client.sAdd(this.ONLINE_SET_KEY, userId);

    const count = await this.client.sCard(socketSetKey);
    return count === 1;
  }

  /**
   * * Unregisters a disconnected socket for a user.
   * * Returns true if the user has no remaining active connections (online -> offline transition).
   */
  async removeConnection(userId: string, socketId: string): Promise<boolean> {
    const socketSetKey = `${this.USER_SOCKETS_PREFIX}${userId}`;
    await this.client.sRem(socketSetKey, socketId);

    const remaining = await this.client.sCard(socketSetKey);
    if (remaining === 0) {
      await this.client.sRem(this.ONLINE_SET_KEY, userId);
      return true;
    }
    return false;
  }

  async getOnlineUsers(): Promise<string[]> {
    return this.client.sMembers(this.ONLINE_SET_KEY);
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const result = await this.client.sIsMember(this.ONLINE_SET_KEY, userId);
    return Boolean(result);
  }
}
