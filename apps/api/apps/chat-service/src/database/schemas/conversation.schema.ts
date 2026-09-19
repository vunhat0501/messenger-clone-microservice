import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  Participant,
  ParticipantSchema,
} from 'apps/chat-service/src/database/schemas/participant.schema';
import { HydratedDocument } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;
@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: [ParticipantSchema], required: true })
  participants: Participant[];

  @Prop({ default: false })
  isGroup: boolean;

  @Prop({ required: false })
  groupName?: string;

  @Prop({ type: Date, default: Date.now })
  lastMessageAt: Date;

  @Prop({ required: false })
  lastMessageSnippet?: string;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ 'participants.userId': 1 });
