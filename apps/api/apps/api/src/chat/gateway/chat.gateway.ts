import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { env } from 'apps/api/src/config/env.config';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @Inject('CHAT_SERVICE') private readonly chatClient: ClientProxy,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      let token: string | undefined =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token && client.handshake.headers?.cookie) {
        const cookies = client.handshake.headers.cookie
          .split(';')
          .reduce((acc, c) => {
            const [k, v] = c.trim().split('=');
            if (k && v) acc[k] = decodeURIComponent(v);
            return acc;
          }, {} as Record<string, string>);
        token = cookies['access_token'];
      }

      if (token) {
        const payload = this.jwtService.verify(token, {
          secret: env.JWT_SECRET,
        });
        client.data.user = payload;
        (client as any).user = {
          userId: payload.sub,
          name: payload.name,
          email: payload.email,
        };
        this.logger.log(
          `Socket client connected: ${client.id} (user: ${payload.sub})`,
        );
      } else {
        this.logger.warn(`Socket client connected without token: ${client.id}`);
      }
    } catch (err: any) {
      this.logger.warn(
        `Socket connection token verification failed: ${err.message}`,
      );
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Socket client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinConversation')
  handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.conversationId) {
      client.join(data.conversationId);
      this.logger.log(
        `Client ${client.id} joined room: ${data.conversationId}`,
      );
      return { success: true, conversationId: data.conversationId };
    }
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.conversationId) {
      client.leave(data.conversationId);
      this.logger.log(`Client ${client.id} left room: ${data.conversationId}`);
      return { success: true, conversationId: data.conversationId };
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody()
    payload: { text: string; conversationId: string; senderId?: number },
    @ConnectedSocket() client: Socket,
  ) {
    const senderId =
      client.data?.user?.sub ??
      (client as any).user?.userId ??
      payload.senderId;

    if (!senderId) {
      return { error: 'Unauthorized sender' };
    }

    const savedMessage = await firstValueFrom(
      this.chatClient.send('save_message', {
        conversationId: payload.conversationId,
        text: payload.text,
        senderId,
      }),
    );

    this.server.to(payload.conversationId).emit('newMessage', savedMessage);
    this.server.emit('conversationUpdated', {
      conversationId: payload.conversationId,
      lastMessageSnippet: payload.text,
      lastMessageAt: new Date(),
    });

    return savedMessage;
  }
}
