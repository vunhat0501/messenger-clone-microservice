import { Inject, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtAuthGuard } from 'apps/api/src/auth/guards/jwt-auth/jwt-auth.guard';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@WebSocketGateway({ cors: true })
export class ChatGateway {
  @WebSocketServer()
  server: Server;
  constructor(@Inject('CHAT_SERVICE') private chatClient: ClientProxy) {}
  @UseGuards(JwtAuthGuard)
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() payload: { text: string; conversationId: string },
    @ConnectedSocket() client: Socket & { user: any },
  ) {
    const savedMessage = await firstValueFrom(
      this.chatClient.send('save_message', {
        ...payload,
        senderId: client.user.userId,
      }),
    );

    this.server.to(payload.conversationId).emit('newMessage', savedMessage);
  }
}
