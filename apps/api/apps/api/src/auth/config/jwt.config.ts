import { registerAs } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';
import { env } from 'apps/api/src/config/env.config';

export default registerAs(
  'jwt',
  (): JwtModuleOptions => ({
    secret: env.JWT_SECRET,
    signOptions: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  }),
);
