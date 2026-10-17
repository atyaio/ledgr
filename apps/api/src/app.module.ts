import { Module, type DynamicModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { LedgrConfigModule } from './common/config/config.module';
import { LedgrContext } from './common/config/ledgr-config';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/auth/auth.module';
import { AuditModule } from './common/audit/audit.module';
import { DOMAIN_MODULES } from './modules';

export interface AppModuleOptions {
  ctx: LedgrContext;
  /** Absolute path to the built dashboard (index.html inside). Omit to run API-only. */
  webDist?: string;
}

@Module({})
export class AppModule {
  static forRoot(opts: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LedgrConfigModule.forRoot(opts.ctx),
        PrismaModule,
        AuthModule,
        AuditModule,
        ScheduleModule.forRoot(),
        ...DOMAIN_MODULES,
        ...(opts.webDist
          ? [
              ServeStaticModule.forRoot({
                rootPath: opts.webDist,
                exclude: ['/api{*splat}'],
                serveStaticOptions: { index: 'index.html', cacheControl: true, maxAge: '1h' },
              }),
            ]
          : []),
      ],
    };
  }
}
