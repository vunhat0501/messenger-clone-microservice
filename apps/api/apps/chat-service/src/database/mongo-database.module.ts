import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import mongoConfig from 'apps/chat-service/src/config/mongo.config';
import { Connection } from 'mongoose';

@Module({
  imports: [
    ConfigModule.forFeature(mongoConfig),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('mongo'),
      }),
    }),
  ],
})
export class MongoDatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(MongoDatabaseModule.name);
  constructor(@InjectConnection() private readonly connection: Connection) {}
  onModuleInit() {
    if (this.connection.readyState === 1) {
      this.logger.log('MongoDB connection established');
    } else {
      this.connection.on('connected', () => {
        this.logger.log('MongoDB connection established');
      });
      this.connection.on('error', (err) => {
        this.logger.error('MongoDB connections failed', err);
      });
    }
  }
}
