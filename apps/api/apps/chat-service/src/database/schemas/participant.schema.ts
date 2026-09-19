import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class Participant {
  @Prop({ type: Number, required: true, index: true })
  userId: number;

  @Prop({ require: true })
  userName: string;

  @Prop({ required: false })
  avatarUrl?: string;
}

export const ParticipantSchema = SchemaFactory.createForClass(Participant);
