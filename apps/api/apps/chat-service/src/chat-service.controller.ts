import { Controller } from '@nestjs/common';
import { ChatServiceService } from './chat-service.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Participant } from './database/schemas/participant.schema';

@Controller()
export class ChatServiceController {
  constructor(private readonly chatServiceService: ChatServiceService) {}

  @MessagePattern('user.profile.updated')
  updatedUser(
    @Payload() data: { userId: number; newAvatar: string; newName: string },
  ) {
    return this.chatServiceService.handleProfileUpdate(
      data.userId,
      data.newAvatar,
      data.newName,
    );
  }

  @MessagePattern('chat.get_conversations')
  getConversations(@Payload() data: { userId: number }) {
    return this.chatServiceService.getConversations(data.userId);
  }

  @MessagePattern('chat.get_conversation_by_id')
  getConversationById(
    @Payload() data: { conversationId: string; userId: number },
  ) {
    return this.chatServiceService.getConversationById(
      data.conversationId,
      data.userId,
    );
  }

  @MessagePattern('chat.create_or_get_direct_conversation')
  createOrGetDirectConversation(
    @Payload() data: { user1: Participant; user2: Participant },
  ) {
    return this.chatServiceService.createOrGetDirectConversation(
      data.user1,
      data.user2,
    );
  }

  @MessagePattern('chat.create_group_conversation')
  createGroupConversation(
    @Payload()
    data: {
      creator: Participant;
      members: Participant[];
      groupName: string;
    },
  ) {
    return this.chatServiceService.createGroupConversation(
      data.creator,
      data.members,
      data.groupName,
    );
  }

  @MessagePattern('chat.get_messages')
  getMessages(
    @Payload() data: { conversationId: string; userId: number; limit?: number },
  ) {
    return this.chatServiceService.getMessages(
      data.conversationId,
      data.userId,
      data.limit,
    );
  }

  @MessagePattern('save_message')
  saveMessage(
    @Payload()
    data: {
      conversationId: string;
      senderId: number;
      text: string;
    },
  ) {
    return this.chatServiceService.saveMessage(data);
  }

  @MessagePattern('chat.save_message')
  saveChatMessage(
    @Payload()
    data: {
      conversationId: string;
      senderId: number;
      text: string;
    },
  ) {
    return this.chatServiceService.saveMessage(data);
  }

  @MessagePattern('chat.mark_read')
  markRead(@Payload() data: { conversationId: string; userId: number }) {
    return this.chatServiceService.markAsRead(data.conversationId, data.userId);
  }
}
