import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsUrl({}, { message: 'Invalid url' })
  @IsOptional()
  avatarUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200, { message: 'Bio must be less than 200 characters' })
  bio?: string;
}
