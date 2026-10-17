import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from './prisma/prisma.service';

/** Either the root Prisma client or a transaction client; services accept both. */
export type Db = PrismaService | Prisma.TransactionClient;

export const toIso = (d: Date): string => d.toISOString();

/** `date >= from AND date <= to` for YYYY-MM-DD string columns. */
export function dateRangeWhere(from?: string | null, to?: string | null): { gte?: string; lte?: string } | undefined {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

export const INTERACTIVE_TX = { timeout: 120_000, maxWait: 10_000 } as const;
