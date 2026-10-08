import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  senderId: number;

  @Prop({ required: true })
  text: string;

  @Prop({ type: [Number], default: [] })
  readBy: number[];
}

export const messageSchema = SchemaFactory.createForClass(Message);
export const MessageSchema = messageSchema;
messageSchema.index({ conversationId: 1, createdAt: -1 });
