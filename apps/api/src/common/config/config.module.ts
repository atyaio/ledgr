import { Global, Module, type DynamicModule } from '@nestjs/common';
import { LedgrContext } from './ledgr-config';

@Global()
@Module({})
export class LedgrConfigModule {
  static forRoot(ctx: LedgrContext): DynamicModule {
    return {
      module: LedgrConfigModule,
      providers: [{ provide: LedgrContext, useValue: ctx }],
      exports: [LedgrContext],
    };
  }
}
