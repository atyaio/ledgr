import { Controller, Get, Query } from '@nestjs/common';
import { auditQuery } from '@ledgr/shared';
import { zod } from '../zod.pipe';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query(zod(auditQuery)) q: ReturnType<typeof auditQuery.parse>) {
    return this.audit.list(q);
  }
}
