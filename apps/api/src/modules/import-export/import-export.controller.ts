import { Body, Controller, Get, Header, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { importCommitSchema, importEntitySchema, rangeQuery, type ImportCommitInput, type ImportEntity, type RangeQuery } from '@ledgr/shared';
import type { Response } from 'express';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { badRequest } from '../../common/errors';
import { replaceQuery, type ReplaceQuery } from '../../common/query';
import { zod } from '../../common/zod.pipe';
import { BackupService } from './backup.service';
import { ExportService } from './export.service';
import { ImportService } from './import.service';

const MAX_UPLOAD = 20 * 1024 * 1024;
const upload = () => UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD, files: 1 } }));

function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

function parseJsonField(raw: unknown, name: string): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest('BAD_JSON', `Form field "${name}" must be a JSON string`);
  }
}

@Controller()
export class ImportExportController {
  constructor(
    private readonly exporter: ExportService,
    private readonly importer: ImportService,
    private readonly backup: BackupService,
  ) {}

  // ─── Export ─────────────────────────────────────────────────────────────────

  @Get('export/backup.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async exportBackup(@Res() res: Response) {
    const file = await this.backup.export();
    res.setHeader('Content-Disposition', `attachment; filename="ledgr-backup-${file.exportedAt.slice(0, 10)}.json"`);
    res.send(JSON.stringify(file));
  }

  @Get('export/template/:entity.csv')
  async exportTemplate(@Param('entity', zod(importEntitySchema)) entity: ImportEntity, @Res() res: Response) {
    sendCsv(res, `ledgr-${entity}-template.csv`, await this.exporter.templateCsv(entity));
  }

  @Get('export/:entity.csv')
  async exportCsv(@Param('entity', zod(importEntitySchema)) entity: ImportEntity, @Query(zod(rangeQuery)) q: RangeQuery, @Res() res: Response) {
    sendCsv(res, this.exporter.filename(entity, q), await this.exporter.csv(entity, q));
  }

  // ─── Import ─────────────────────────────────────────────────────────────────

  @Post('import/backup')
  restoreBackup(@Body() body: unknown, @Query(zod(replaceQuery)) q: ReplaceQuery, @User() user: CurrentUser) {
    return this.backup.restore(body, q.replace, user);
  }

  @Post('import/:entity/preview')
  @upload()
  preview(@Param('entity', zod(importEntitySchema)) entity: ImportEntity, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Upload a CSV file in the "file" field');
    return this.importer.preview(entity, file.buffer);
  }

  @Post('import/:entity/commit')
  @upload()
  commit(
    @Param('entity', zod(importEntitySchema)) entity: ImportEntity,
    @Body() body: Record<string, unknown>,
    @User() user: CurrentUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Upload a CSV file in the "file" field');
    const input: ImportCommitInput = importCommitSchema.parse({
      mapping: parseJsonField(body.mapping, 'mapping') ?? {},
      options: parseJsonField(body.options, 'options'),
    });
    return this.importer.commit(entity, file.buffer, input, user);
  }
}
