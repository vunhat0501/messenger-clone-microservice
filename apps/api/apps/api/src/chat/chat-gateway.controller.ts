import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from 'apps/api/src/auth/guards/jwt-auth/jwt-auth.guard';
import { GetUser } from 'apps/api/src/auth/decorators/get-user.decorator';
import { AuthenticatedUser } from '@workspace/types';
import { ChatGateway } from './gateway/chat.gateway';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatGatewayController {
  constructor(
    @Inject('CHAT_SERVICE') private readonly chatClient: ClientProxy,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('conversations')
  async getConversations(@GetUser() user: AuthenticatedUser) {
    return this.chatClient.send('chat.get_conversations', { userId: user.id });
  }

  @Get('conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.chatClient.send('chat.get_conversation_by_id', {
      conversationId: id,
      userId: user.id,
    });
  }

  @Post('conversations')
  async createOrGetConversation(
    @GetUser() user: AuthenticatedUser,
    @Body()
    body: {
      targetUserId?: number;
      targetUserName?: string;
      isGroup?: boolean;
      groupName?: string;
      participantIds?: number[];
    },
  ) {
    const currentUserInfo = await firstValueFrom(
      this.authClient.send('user.find_one', { id: user.id }),
    );
    const user1 = {
      userId: user.id,
      userName: currentUserInfo?.userName ?? user.name,
      avatarUrl: currentUserInfo?.avatarUrl,
    };

    if (body.isGroup && body.participantIds?.length) {
      const members = await Promise.all(
        body.participantIds.map(async (pId) => {
          const u = await firstValueFrom(
            this.authClient.send('user.find_one', { id: pId }),
          );
          return {
            userId: pId,
            userName: u?.userName ?? `User ${pId}`,
            avatarUrl: u?.avatarUrl,
          };
        }),
      );
      return this.chatClient.send('chat.create_group_conversation', {
        creator: user1,
        members,
        groupName: body.groupName || 'Group Chat',
      });
    }

    let targetId = body.targetUserId;
    if (!targetId && body.targetUserName) {
      const targetUser = await firstValueFrom(
        this.authClient.send('user.get_profile', {
          userName: body.targetUserName,
        }),
      );
      targetId = targetUser?.id;
    }

    if (!targetId) {
      throw new BadRequestException('Target user is required');
    }

    const targetUserInfo = await firstValueFrom(
      this.authClient.send('user.find_one', { id: targetId }),
    );

    if (!targetUserInfo) {
      throw new NotFoundException('Target user not found');
    }

    const user2 = {
      userId: targetUserInfo.id,
      userName: targetUserInfo.userName,
      avatarUrl: targetUserInfo.avatarUrl,
    };

    return this.chatClient.send('chat.create_or_get_direct_conversation', {
      user1,
      user2,
    });
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') conversationId: string,
    @GetUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.chatClient.send('chat.get_messages', {
      conversationId,
      userId: user.id,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id') conversationId: string,
    @GetUser() user: AuthenticatedUser,
    @Body() body: { text: string },
  ) {
    const savedMessage = await firstValueFrom(
      this.chatClient.send('save_message', {
        conversationId,
        senderId: user.id,
        text: body.text,
      }),
    );

    this.chatGateway.server.to(conversationId).emit('newMessage', savedMessage);
    this.chatGateway.server.emit('conversationUpdated', {
      conversationId,
      lastMessageSnippet: body.text,
      lastMessageAt: new Date(),
    });

    return savedMessage;
  }

  @Post('conversations/:id/read')
  async markRead(
    @Param('id') conversationId: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.chatClient.send('chat.mark_read', {
      conversationId,
      userId: user.id,
    });
  }
}
