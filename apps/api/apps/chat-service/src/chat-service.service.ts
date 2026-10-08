import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
} from './database/schemas/conversation.schema';
import {
  Message,
  MessageDocument,
} from './database/schemas/message.schema';
import { Participant } from './database/schemas/participant.schema';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class ChatServiceService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
  ) {}

  async handleProfileUpdate(
    userId: number,
    newAvatar: string,
    newName: string,
  ) {
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
  }

  async getConversations(userId: number) {
    return this.conversationModel
      .find({
        'participants.userId': userId,
      })
      .sort({ lastMessageAt: -1 })
      .lean()
      .exec();
  }

  async getConversationById(conversationId: string, userId: number) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new RpcException('Invalid conversation ID');
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
    return conversation;
  }

  async createOrGetDirectConversation(user1: Participant, user2: Participant) {
    if (user1.userId === user2.userId) {
      throw new RpcException('Cannot start a direct conversation with yourself');
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
    }

    return conversation;
  }

  async createGroupConversation(
    creator: Participant,
    members: Participant[],
    groupName: string,
  ) {
    const participantMap = new Map<number, Participant>();
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

    return conversation;
  }

  async getMessages(conversationId: string, userId: number, limit = 100) {
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

    return this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async saveMessage(payload: {
    conversationId: string;
    senderId: number;
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
      throw new RpcException('Conversation not found or sender not a participant');
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

    return message;
  }

  async markAsRead(conversationId: string, userId: number) {
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

    return { success: true };
  }
}
