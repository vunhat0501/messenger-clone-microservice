import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
} from './database/schemas/conversation.schema';
import { Message, MessageDocument } from './database/schemas/message.schema';
import { Participant } from './database/schemas/participant.schema';
import { RpcException } from '@nestjs/microservices';
import { env } from 'apps/api/src/config/env.config';
import {
  CACHE_KEYS,
  CACHE_TTL,
} from 'apps/api/src/common/cache/cache.constants';

@Injectable()
export class ChatServiceService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  private async invalidateParticipantsConversationCache(
    participants: Participant[],
    conversationId?: string,
  ) {
    const tasks: Promise<unknown>[] = [];
    for (const p of participants) {
      tasks.push(this.cacheManager.del(CACHE_KEYS.userConversations(p.userId)));
      if (conversationId) {
        tasks.push(
          this.cacheManager.del(
            CACHE_KEYS.conversationById(conversationId, p.userId),
          ),
        );
      }
    }
    if (conversationId) {
      tasks.push(
        this.cacheManager.del(
          CACHE_KEYS.conversationMessages(conversationId, 100),
        ),
      );
    }
    await Promise.all(tasks);
  }

  async handleProfileUpdate(
    userId: string,
    newAvatar: string,
    newName: string,
  ) {
    const affectedConversations = await this.conversationModel
      .find({ 'participants.userId': userId })
      .select('participants')
      .lean()
      .exec();

    await this.conversationModel.updateMany(
      {
        'participants.userId': userId,
      },
      {
        $set: {
          'participants.$.avatarUrl': newAvatar,
          'participants.$.userName': newName,
        },
      },
    );

    const participantIds = new Set<string>([userId]);
    for (const conv of affectedConversations) {
      for (const p of conv.participants ?? []) {
        participantIds.add(p.userId);
      }
    }
    await Promise.all(
      Array.from(participantIds).map((id) =>
        this.cacheManager.del(CACHE_KEYS.userConversations(id)),
      ),
    );
  }

  async getConversations(userId: string) {
    const cacheKey = CACHE_KEYS.userConversations(userId);
    const cached = await this.cacheManager.get<Conversation[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const conversations = await this.conversationModel
      .find({
        'participants.userId': userId,
      })
      .sort({ lastMessageAt: -1 })
      .read(env.MONGO_READ_PREFERENCE)
      .lean()
      .exec();

    await this.cacheManager.set(
      cacheKey,
      conversations,
      CACHE_TTL.CONVERSATIONS,
    );
    return conversations;
  }

  async getConversationById(conversationId: string, userId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new RpcException('Invalid conversation ID');
    }

    const cacheKey = CACHE_KEYS.conversationById(conversationId, userId);
    const cached = await this.cacheManager.get<Conversation>(cacheKey);
    if (cached) {
      return cached;
    }

    const conversation = await this.conversationModel
      .findOne({
        _id: new Types.ObjectId(conversationId),
        'participants.userId': userId,
      })
      .lean()
      .exec();

    if (!conversation) {
      throw new RpcException('Conversation not found or access denied');
    }

    await this.cacheManager.set(
      cacheKey,
      conversation,
      CACHE_TTL.CONVERSATIONS,
    );
    return conversation;
  }

  async createOrGetDirectConversation(user1: Participant, user2: Participant) {
    if (user1.userId === user2.userId) {
      throw new RpcException(
        'Cannot start a direct conversation with yourself',
      );
    }

    let conversation = await this.conversationModel.findOne({
      isGroup: false,
      $and: [
        { 'participants.userId': user1.userId },
        { 'participants.userId': user2.userId },
      ],
    });

    if (!conversation) {
      conversation = await this.conversationModel.create({
        participants: [
          {
            userId: user1.userId,
            userName: user1.userName,
            avatarUrl: user1.avatarUrl,
          },
          {
            userId: user2.userId,
            userName: user2.userName,
            avatarUrl: user2.avatarUrl,
          },
        ],
        isGroup: false,
        lastMessageAt: new Date(),
        lastMessageSnippet: '',
      });

      await this.invalidateParticipantsConversationCache(
        conversation.participants,
        String(conversation._id),
      );
    }

    return conversation;
  }

  async createGroupConversation(
    creator: Participant,
    members: Participant[],
    groupName: string,
  ) {
    const participantMap = new Map<string, Participant>();
    participantMap.set(creator.userId, creator);
    for (const member of members) {
      participantMap.set(member.userId, member);
    }

    const conversation = await this.conversationModel.create({
      participants: Array.from(participantMap.values()),
      isGroup: true,
      groupName: groupName || 'Group Chat',
      lastMessageAt: new Date(),
      lastMessageSnippet: '',
    });

    await this.invalidateParticipantsConversationCache(
      conversation.participants,
      String(conversation._id),
    );

    return conversation;
  }

  async getMessages(conversationId: string, userId: string, limit = 100) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new RpcException('Invalid conversation ID');
    }

    const conv = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      'participants.userId': userId,
    });
    if (!conv) {
      throw new RpcException('Conversation not found or access denied');
    }

    const cacheKey = CACHE_KEYS.conversationMessages(conversationId, limit);
    const cachedMessages = await this.cacheManager.get<Message[]>(cacheKey);
    if (cachedMessages) {
      return cachedMessages;
    }

    const messages = await this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
      })
      .sort({ createdAt: 1 })
      .read(env.MONGO_READ_PREFERENCE)
      .limit(limit)
      .lean()
      .exec();

    await this.cacheManager.set(cacheKey, messages, CACHE_TTL.MESSAGES);
    return messages;
  }

  async saveMessage(payload: {
    conversationId: string;
    senderId: string;
    text: string;
  }) {
    if (!Types.ObjectId.isValid(payload.conversationId)) {
      throw new RpcException('Invalid conversation ID');
    }

    const conv = await this.conversationModel.findOne({
      _id: new Types.ObjectId(payload.conversationId),
      'participants.userId': payload.senderId,
    });
    if (!conv) {
      throw new RpcException(
        'Conversation not found or sender not a participant',
      );
    }

    const message = await this.messageModel.create({
      conversationId: new Types.ObjectId(payload.conversationId),
      senderId: payload.senderId,
      text: payload.text,
      readBy: [payload.senderId],
    });

    await this.conversationModel.findByIdAndUpdate(payload.conversationId, {
      lastMessageAt: new Date(),
      lastMessageSnippet: payload.text,
    });

    await this.invalidateParticipantsConversationCache(
      conv.participants,
      payload.conversationId,
    );

    return message;
  }

  async markAsRead(conversationId: string, userId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new RpcException('Invalid conversation ID');
    }

    await this.messageModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        readBy: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId },
      },
    );

    await this.cacheManager.del(
      CACHE_KEYS.conversationMessages(conversationId, 100),
    );

    return { success: true };
  }
}
