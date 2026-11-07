import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import z from 'zod';

const envPath = resolve(process.cwd(), '../../.env');

if (!existsSync(envPath)) {
  throw new Error(`FATAL: .env file not found. Expected in: ${envPath}`);
}

config({ path: envPath });

export const envSchema = z.object({
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z
    .string({
      required_error: 'DATABASE_URL is required',
      invalid_type_error: 'DATABASE_URL must be a string',
      message: 'Please add database URL to .env file',
    })
    .url('DATABASE_URL must be a valid url'),
  DATABASE_REPLICA_URL: z.string().url().optional(),
  PG_REPL_USER: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .default('replicator'),
  PG_REPL_PASSWORD: z.string().min(1).optional(),

  //** These database variables is optional in case using database hosting like Neon */
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASS: z.string().default('postgres'),
  DB_NAME: z.string().default('postgres'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  MONGO_URI: z
    .string({
      required_error: 'MONGO_URI is required',
      invalid_type_error: 'MONGO_URI must be a string',
      message: 'Please add mongo URI to .env file',
    })
    // URL rejects valid MongoDB seed lists containing multiple host:port pairs.
    .regex(
      /^mongodb(?:\+srv)?:\/\/[^\s/]+(?:\/[^\s]*)?$/,
      'MONGO_URI must be a MongoDB connection string',
    ),
  MONGO_USER: z.string().default('admin'),
  MONGO_PASS: z.string().default('password'),
  MONGO_REPLICA_SET: z.string().trim().min(1).optional(),
  MONGO_READ_PREFERENCE: z
    .enum([
      'primary',
      'primaryPreferred',
      'secondary',
      'secondaryPreferred',
      'nearest',
    ])
    .default('secondaryPreferred'),

  RABBITMQ_URL: z
    .string({
      required_error: 'RABBITMQ_URL is required',
      invalid_type_error: 'RABBITMQ_URL must be a string',
      message: 'Please add rabbitmq URL to .env file',
    })
    .url('RABBITMQ_URL must be a valid url'),
  RABBITMQ_USER: z.string().default('admin'),
  RABBITMQ_PASS: z.string().default('password'),

  REDIS_URL: z
    .string({
      required_error: 'REDIS_URL is required',
      invalid_type_error: 'REDIS_URL must be a string',
      message: 'Please add redis URL to .env file',
    })
    .url('REDIS_URL must be a valid url'),

  JWT_SECRET: z.string().default('secret'),
  JWT_EXPIRES_IN: z.coerce.number().default(300),
  REFRESH_JWT_SECRET: z.string().default('secret'),
  REFRESH_JWT_EXPIRES_IN: z.coerce.number().default(604800),
});

export const env = envSchema.parse(process.env);
