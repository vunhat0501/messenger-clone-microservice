import { registerAs } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';
import { env } from 'apps/api/src/config/env.config';

export default registerAs(
  'mongo',
  (): MongooseModuleOptions => ({ uri: env.MONGO_URI }),
);
