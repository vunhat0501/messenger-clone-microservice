import { CreateUserDto } from 'apps/auth-service/src/user/dto/create-user.dto';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAuthDto extends CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(32, { message: 'Password must be at most 20 characters long' })
  password: string;
}
