import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../../generated/prisma/client';
import { LedgrContext } from '../config/ledgr-config';
import { runMigrations } from './migrator';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor(ctx: LedgrContext) {
    const { applied } = runMigrations(ctx.paths.dbPath);
    if (applied.length) Logger.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`, 'Prisma');
    super({ adapter: new PrismaBetterSqlite3({ url: ctx.paths.dbPath }) });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('SQLite connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
