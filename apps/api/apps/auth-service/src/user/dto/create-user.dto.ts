import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  @MaxLength(20, { message: 'Name must be at most 20 characters long' })
  userName: string;

  @IsEmail({}, { message: 'Invalid email' })
  @IsNotEmpty()
  email: string;
}
