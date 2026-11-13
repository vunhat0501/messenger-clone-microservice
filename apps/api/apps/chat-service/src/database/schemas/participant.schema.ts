import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class Participant {
  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: false })
  avatarUrl?: string;
}

export const ParticipantSchema = SchemaFactory.createForClass(Participant);
