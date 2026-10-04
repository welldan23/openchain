import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { FlowsModule } from './flows/flows.module.js';
import { SnapshotsModule } from './snapshots/snapshots.module.js';
import { TokensModule } from './tokens/tokens.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, TokensModule, SnapshotsModule, FlowsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
